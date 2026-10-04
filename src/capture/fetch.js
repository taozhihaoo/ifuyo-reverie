/**
 * Fetch stage of the capture pipeline (M1 §6.1).
 * Remote content is untrusted: scheme allowlist per hop, redirect cap,
 * hard timeout, response size cap, content-type gate, charset-aware decode.
 */
import { ERROR_CODES } from './protocol.js';

export const FETCH_LIMITS = Object.freeze({
  timeoutMs: 15_000,
  maxBytes: 5 * 1024 * 1024, // 5 MiB HTML
  maxRedirects: 5,
  assetTimeoutMs: 10_000,
  assetMaxBytes: 10 * 1024 * 1024, // 10 MiB per image
});

export class FetchError extends Error {
  constructor(error_code, message) {
    super(message);
    this.error_code = error_code;
    this.code = error_code; // both spellings: pipeline reads error_code, feed/service read code
  }
}

const assertHttp = (url) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new FetchError(ERROR_CODES.INVALID_URL, `unparsable URL: ${url}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new FetchError(ERROR_CODES.INVALID_URL, `scheme not allowed: ${u.protocol}`);
  }
  return u;
};

/** Decode a body buffer honoring the Content-Type charset (default utf-8). */
export function decodeBody(buffer, contentType = '') {
  const m = /charset=["']?([\w-]+)/i.exec(contentType);
  const charset = (m?.[1] ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
}

/**
 * Private-network policy (M4 §57): localhost / loopback / RFC1918 /
 * link-local / unique-local hosts are refused by default. Hostname-level
 * check (DNS-resolved IP pinning is a known limitation, see NETWORK.md).
 */
export function assertPublicHost(hostname, { allowPrivateNetwork = process.env.REVERIE_ALLOW_PRIVATE_NETWORK === '1' } = {}) {
  // explicit policy (M4 §57): allowPrivateNetwork === true disables the
  // check entirely; an ARRAY is an explicit host allowlist (test servers /
  // user-approved LAN feeds); default (false) blocks private ranges.
  if (Array.isArray(allowPrivateNetwork) && allowPrivateNetwork.includes(hostname.toLowerCase())) return;
  if (allowPrivateNetwork === true) return;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new FetchError(ERROR_CODES.SECURITY_REJECTED, `private host not allowed: ${h}`);
  }
  if (/^127\./.test(h) || h === '::1' || h === '0:0:0:0:0:0:0:1') {
    throw new FetchError(ERROR_CODES.SECURITY_REJECTED, `loopback not allowed: ${h}`);
  }
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    throw new FetchError(ERROR_CODES.SECURITY_REJECTED, `private address not allowed: ${h}`);
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new FetchError(ERROR_CODES.SECURITY_REJECTED, `private address not allowed: ${h}`);
  }
  if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h)) {
    throw new FetchError(ERROR_CODES.SECURITY_REJECTED, `private IPv6 not allowed: ${h}`);
  }
}

/**
 * Generic binary-safe fetch (shared HTTP infrastructure, M4 §53): http(s)
 * only, per-hop URL policy incl. private-network guard, redirect cap,
 * timeout, size cap, conditional-request support (ETag / Last-Modified).
 * Returns { finalUrl, status, notModified, contentType, etag, lastModified, buffer }.
 */
export async function fetchUrl(url, {
  limits = FETCH_LIMITS,
  headers = {},
  signal = null,
  allowPrivateNetwork = process.env.REVERIE_ALLOW_PRIVATE_NETWORK === '1',
} = {}) {
  let current = url;
  for (let redirects = 0; redirects <= limits.maxRedirects; redirects++) {
    assertHttp(current);
    assertPublicHost(new URL(current).hostname, { allowPrivateNetwork });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: controller.signal, headers });
    } catch (err) {
      if (signal?.aborted) throw new FetchError(ERROR_CODES.NETWORK_ERROR, 'fetch cancelled');
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `fetch failed: ${err?.cause?.message ?? err.message}`);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', () => controller.abort());
    }
    if (res.status === 304) {
      return { finalUrl: current, status: 304, notModified: true, contentType: null, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'), buffer: null };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new FetchError(ERROR_CODES.NETWORK_ERROR, `redirect without location (HTTP ${res.status})`);
      const next = new URL(location, current).href;
      current = next; // per-hop policy re-runs at loop top (scheme + host, M4 §55)
      continue;
    }
    if (!res.ok) {
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `HTTP ${res.status} for ${current}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > limits.maxBytes) {
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `response exceeds ${limits.maxBytes} bytes`);
    }
    return {
      finalUrl: current,
      status: res.status,
      notModified: false,
      contentType,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      buffer,
    };
  }
  throw new FetchError(ERROR_CODES.NETWORK_ERROR, `too many redirects (> ${limits.maxRedirects})`);
}

/**
 * Fetch an HTML page. Returns { finalUrl, status, contentType, html }.
 * Throws FetchError with a stable error code on any violation.
 */
export async function fetchPage(url, limits = FETCH_LIMITS, { allowPrivateNetwork = process.env.REVERIE_ALLOW_PRIVATE_NETWORK === '1' } = {}) {
  assertHttp(url);
  let current = url;
  for (let redirects = 0; redirects <= limits.maxRedirects; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'ReverieCapture/0.1 (+personal archive; like a read-later client)' },
      });
    } catch (err) {
      if (signal?.aborted) throw new FetchError(ERROR_CODES.NETWORK_ERROR, 'fetch cancelled');
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `fetch failed: ${err?.cause?.message ?? err.message}`);
    } finally {
      clearTimeout(timer);
    }
    assertPublicHost(new URL(current).hostname); // revalidate after redirects (M4 §57)
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new FetchError(ERROR_CODES.NETWORK_ERROR, `redirect without location (HTTP ${res.status})`);
      const next = new URL(location, current).href;
      assertHttp(next); // no scheme downgrades via redirects
      current = next;
      continue;
    }
    if (!res.ok) {
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `HTTP ${res.status} for ${current}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new FetchError(ERROR_CODES.EXTRACTION_FAILED, `unsupported content-type: ${contentType || '(none)'}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > limits.maxBytes) {
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `response exceeds ${limits.maxBytes} bytes`);
    }
    return { finalUrl: current, status: res.status, contentType, html: decodeBody(buffer, contentType) };
  }
  throw new FetchError(ERROR_CODES.NETWORK_ERROR, `too many redirects (> ${limits.maxRedirects})`);
}

/**
 * Fetch one binary asset (image). Returns { buffer, contentType } or throws
 * FetchError. Only image/* content types are accepted (SVG is NOT image/*-trusted
 * by callers — they decide; here we merely gate obvious non-images).
 */
export async function fetchAsset(url, limits = FETCH_LIMITS) {
  assertHttp(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.assetTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new FetchError(ERROR_CODES.ASSET_DOWNLOAD_FAILED, `HTTP ${res.status} for asset`);
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\//i.test(contentType)) {
      throw new FetchError(ERROR_CODES.ASSET_DOWNLOAD_FAILED, `asset is not an image: ${contentType || '(none)'}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > limits.assetMaxBytes) {
      throw new FetchError(ERROR_CODES.ASSET_DOWNLOAD_FAILED, `asset exceeds ${limits.assetMaxBytes} bytes`);
    }
    return { buffer, contentType };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(ERROR_CODES.ASSET_DOWNLOAD_FAILED, `asset fetch failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
