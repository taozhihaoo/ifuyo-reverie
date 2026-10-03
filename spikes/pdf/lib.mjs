/**
 * pdfjs-dist helper for the PDF Spike (Node side, extraction-focused).
 * Rendering (canvas) is browser territory — M7 verifies that in-app; the
 * M0 questions here are: parse, page model, text layer, search.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

export async function getPdfjs() {
  const legacy = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.mjs');
  return import(pathToFileURL(legacy).href);
}

export async function openPdf(pdfPath) {
  const pdfjs = await getPdfjs();
  const { mkdirSync } = await import('node:fs');
  const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const fontsDir = path.join(pkgDir, 'standard_fonts') + path.sep;
  mkdirSync(fontsDir, { recursive: true }); // no-op if present
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    standardFontDataUrl: pathToFileURL(fontsDir).href,
  }).promise;
  return doc;
}

/** Extract a page's text items joined into searchable text. */
export async function pageText(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
  // pdf.js splits text runs at arbitrary boundaries (kerning/font changes),
  // so naive joining can split words; normalized form is word-split-proof.
  const raw = items.map((i) => i.str).join(' ');
  return { text: raw, items, normalized: normalizeForSearch(raw) };
}

export const normalizeForSearch = (s) => s.toLowerCase().replace(/\s+/g, '');

/** Search a term across all pages (whitespace-insensitive). */
export async function searchPdf(doc, term) {
  const needle = normalizeForSearch(term);
  const hits = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { normalized } = await pageText(doc, p);
    if (normalized.includes(needle)) hits.push(p);
  }
  return hits;
}
