/**
 * Asset resolution (M1 §11-12): download article images into
 * assets/<sha256>.<ext>, rewrite references via the returned assetMap.
 * A failed asset NEVER fails the article — it is recorded and the original
 * remote URL is kept in place (article stays readable, gap is visible).
 */
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { pLimit } from '../core/p-limit.js';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg', // rendered via <img> only — no script execution context
};

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Collect absolute image URLs from sanitized HTML (deduped, order kept). */
export function collectImageUrls(html, baseUrl) {
  const doc = new JSDOM(html).window.document;
  const urls = [];
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (!src || src.startsWith('data:')) continue; // data: URIs are already local
    try {
      const abs = new URL(src, baseUrl).href;
      if (abs.startsWith('http')) urls.push({ img, src, abs });
    } catch { /* unparsable src — leave untouched */ }
  }
  const seen = new Set();
  return urls.filter((u) => (seen.has(u.abs) ? false : (seen.add(u.abs), true)));
}

/**
 * Download all images. Returns
 * { assetMap: Map<originalSrcAttribute, 'assets/<hash>.<ext'>, saved: [...], failed: [...] }.
 * assetMap keys are the ORIGINAL attribute values (Readability output uses
 * absolute URLs), which is what the markdown serializer looks up.
 */
export async function resolveAssets(sanitizedHtml, { baseUrl, fetchAsset, concurrency = 4 } = {}) {
  const targets = collectImageUrls(sanitizedHtml, baseUrl);
  const assetMap = new Map();
  const saved = [];
  const failed = [];
  const limit = pLimit(concurrency);

  await Promise.all(targets.map(({ src, abs }) => limit(async () => {
    try {
      const { buffer, contentType } = await fetchAsset(abs);
      const ext = EXT_BY_MIME[contentType.split(';')[0].trim().toLowerCase()] ?? 'img';
      const filename = `assets/${sha256(buffer)}.${ext}`;
      assetMap.set(src, filename);
      assetMap.set(abs, filename); // both raw and absolute forms
      saved.push({ url: abs, filename, bytes: buffer.length, content_type: contentType, buffer });
    } catch (err) {
      failed.push({ url: abs, error_code: err.error_code ?? 'ASSET_DOWNLOAD_FAILED', message: err.message });
    }
  })));

  return { assetMap, saved, failed };
}
