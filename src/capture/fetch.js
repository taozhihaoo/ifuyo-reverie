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
 * Fetch an HTML page. Returns { finalUrl, status, contentType, html }.
 * Throws FetchError with a stable error code on any violation.
 */
export async function fetchPage(url, limits = FETCH_LIMITS) {
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
      throw new FetchError(ERROR_CODES.NETWORK_ERROR, `fetch failed: ${err?.cause?.message ?? err.message}`);
    } finally {
      clearTimeout(timer);
    }
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
