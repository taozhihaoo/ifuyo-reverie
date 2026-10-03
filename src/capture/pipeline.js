/**
 * Web Capture Pipeline (M1 §6): Fetch -> Extract -> Sanitize -> Assets ->
 * Markdown -> Duplicate check -> Persist -> Verify.
 * Each stage returns stable error codes; the pipeline never throws past the
 * fetch stage — failures are results, so the queue can record them.
 */
import { newId } from '../core/ids.js';
import { FORMAT_VERSION } from '../core/meta.js';
import { extractArticle } from '../extraction/extract.js';
import { sanitizeArticleHtml } from '../security/sanitize-html.js';
import { htmlToMarkdown } from '../article/markdown.js';
import { resolveAssets, sha256 } from './assets.js';
import { fetchPage, fetchAsset, FetchError, FETCH_LIMITS } from './fetch.js';
import { captureToLibrary } from '../library/persist.js';
import { scanLibrary } from '../library/scan.js';
import { ERROR_CODES, RESPONSE_STATUSES } from './protocol.js';

const EXTRACTOR = { name: 'readability' };
let EXTRACTOR_VERSION = 'unknown';

/** Tracking-param-stripped, param-sorted, host-lowercased URL form for dedupe. */
export function canonicalizeForDedupe(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const drop = [];
    for (const [k] of u.searchParams) {
      if (/^utm_/i.test(k) || /^(fbclid|gclid|ref|ref_src|ref_url)$/i.test(k)) drop.push(k);
    }
    for (const k of drop) u.searchParams.delete(k);
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const qs = params.map(([k, v]) => `${k}=${v}`).join('&');
    return `${u.protocol}//${u.hostname}${u.pathname.replace(/\/+$/, '')}${qs ? '?' + qs : ''}`;
  } catch {
    return rawUrl;
  }
}

async function findExistingSameSource(libraryRoot, { originalUrl, canonicalUrl }) {
  const { entries } = await scanLibrary(libraryRoot);
  const wanted = new Set([canonicalizeForDedupe(originalUrl)]);
  if (canonicalUrl) wanted.add(canonicalizeForDedupe(canonicalUrl));
  return entries.filter((e) => {
    const urls = [e.original_url, e.canonical_url].filter(Boolean).map(canonicalizeForDedupe);
    return urls.some((u) => wanted.has(u));
  });
}

/**
 * Run one capture. Returns a RESULT (never throws):
 * { status, article_id?, error_code?, message?, warnings?, degraded? }
 */
export async function runCapture(request, {
  libraryRoot,
  fetchPageImpl = fetchPage,
  fetchAssetImpl = fetchAsset,
  limits = FETCH_LIMITS,
  now = new Date().toISOString(),
} = {}) {
  // 1. fetch
  let page;
  try {
    page = await fetchPageImpl(request.url, limits);
  } catch (err) {
    if (err instanceof FetchError) {
      return { status: RESPONSE_STATUSES.FAILED, error_code: err.error_code, message: err.message };
    }
    return { status: RESPONSE_STATUSES.FAILED, error_code: ERROR_CODES.NETWORK_ERROR, message: String(err.message) };
  }

  // 2. extract (M0-verified extractor; extractor version recorded once)
  if (EXTRACTOR_VERSION === 'unknown') {
    try {
      EXTRACTOR_VERSION = (await import('@mozilla/readability/package.json', { with: { type: 'json' } })).default.version;
    } catch { /* keep 'unknown' rather than guess */ }
  }
  let extraction;
  try {
    extraction = extractArticle(page.html, { url: page.finalUrl });
  } catch (err) {
    return { status: RESPONSE_STATUSES.FAILED, error_code: ERROR_CODES.EXTRACTION_FAILED, message: `extractor threw: ${err.message}` };
  }
  const article = extraction.article;
  if (!article || (article.text_content ?? '').trim().length === 0) {
    return {
      status: RESPONSE_STATUSES.FAILED,
      error_code: ERROR_CODES.EXTRACTION_FAILED,
      message: extraction.rejection === 'too-short'
        ? 'page has no extractable article (nav-only shell or empty content)'
        : 'no article candidate found',
    };
  }

  // 3. sanitize (Reader will never execute third-party code)
  let sanitized;
  try {
    sanitized = await sanitizeArticleHtml(article.content_html ?? '');
  } catch (err) {
    return { status: RESPONSE_STATUSES.FAILED, error_code: ERROR_CODES.SECURITY_REJECTED, message: `sanitization failed: ${err.message}` };
  }

  // 4. assets (failures degrade, never abort — M1 §12)
  const { assetMap, saved, failed } = await resolveAssets(sanitized, {
    baseUrl: page.finalUrl,
    fetchAsset: fetchAssetImpl,
  });

  // 5. markdown (local asset references rewritten)
  const markdown = htmlToMarkdown(sanitized, { assetMap });

  // 6. duplicate check: same source + same content = duplicate; same source +
  //    different content = legitimate re-capture (M1 §5.2, §28)
  const contentHash = 'sha256-' + sha256(Buffer.from(markdown, 'utf8'));
  const canonicalUrl = extraction.canonical ?? null;
  let existing;
  try {
    existing = await findExistingSameSource(libraryRoot, { originalUrl: request.url, canonicalUrl });
  } catch (err) {
    return { status: RESPONSE_STATUSES.FAILED, error_code: ERROR_CODES.PERSIST_FAILED, message: `library scan failed: ${err.message}` };
  }
  const duplicate = existing.find((e) => e.content_hash && e.content_hash === contentHash);
  if (duplicate) {
    return { status: RESPONSE_STATUSES.DUPLICATE, article_id: duplicate.document_id, message: 'same source and identical content already captured' };
  }

  // 7. meta (FORMAT.md v1 fields; document_id = directory id, never URL-derived;
  //      absent optional fields are OMITTED, never null — FORMAT.md §3)
  const documentId = newId();
  const meta = {
    format_version: FORMAT_VERSION,
    document_id: documentId,
    type: 'article',
    title: article.title?.trim() || request.title?.trim() || canonicalUrl || request.url,
    created_at: now,
    captured_at: now,
    updated_at: now,
    source: {
      original_url: request.url,
      capture_time: now,
      extractor: { name: EXTRACTOR.name, version: EXTRACTOR_VERSION },
      content_hash: contentHash,
    },
  };
  if (article.byline?.trim()) meta.author = article.byline.trim();
  if (article.published_time) meta.published_at = article.published_time;
  if (article.lang) meta.language = article.lang;
  if (canonicalUrl) meta.source.canonical_url = canonicalUrl;
  if (failed.length > 0) meta.capture_warnings = failed.map((f) => ({ code: 'asset_download_failed', url: f.url, error_code: f.error_code }));
  if (article.description) meta.description = article.description;
  if (article.site_name) meta.site_name = article.site_name;

  // 8. persist (staging -> validate -> atomic promote)
  try {
    await captureToLibrary({
      libraryRoot,
      meta,
      articleMarkdown: markdown,
      sourceHtml: page.html,
      assets: saved.map((s) => ({ filename: s.filename, buffer: s.buffer })),
      now,
    });
  } catch (err) {
    return { status: RESPONSE_STATUSES.FAILED, error_code: err.error_code ?? ERROR_CODES.PERSIST_FAILED, message: err.message };
  }

  return {
    status: RESPONSE_STATUSES.COMPLETED,
    article_id: documentId,
    warnings: failed.length > 0 ? failed.map((f) => ({ code: 'asset_download_failed', url: f.url })) : [],
    degraded: failed.length > 0,
  };
}
