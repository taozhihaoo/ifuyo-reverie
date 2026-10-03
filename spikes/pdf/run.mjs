/**
 * PDF Spike runner (M0 §15): Open / page model / Text layer / Search,
 * plus multi-column ordering observation and scanned-PDF behavior.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPdf, pageText, searchPdf, normalizeForSearch } from './lib.mjs';

const fixture = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'pdf', name);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  if (!ok) failures++;
};

// --- text.pdf ---
{
  const t0 = Date.now();
  const doc = await openPdf(fixture('text.pdf'));
  const openMs = Date.now() - t0;
  check('text.pdf opens', doc.numPages === 5, `${doc.numPages} pages, open ${openMs}ms`);

  const p1 = await pageText(doc, 1);
  check('text.pdf page 1 has text layer', p1.normalized.length > 400, `${p1.text.length} chars`);
  check("text.pdf page 1 content", p1.normalized.includes(normalizeForSearch("Paragraph 1:")), '');
  check("text.pdf item coordinates present", p1.items.length >= 10 && p1.items.every((i) => Number.isFinite(i.x) && Number.isFinite(i.y)),
    `${p1.items.length} items`);

  const hits = await searchPdf(doc, 'heron counts');
  check('text.pdf cross-page search', hits.length === 5, `hits on pages ${hits.join(',')}`);
}

// --- long.pdf ---
{
  const t0 = Date.now();
  const doc = await openPdf(fixture('long.pdf'));
  const openMs = Date.now() - t0;
  const t1 = Date.now();
  const p100 = await pageText(doc, 100);
  const extractMs = Date.now() - t1;
  check('long.pdf opens (100 pages)', doc.numPages === 100, `open ${openMs}ms`);
  check('long.pdf random access to p100', p100.text.includes('page 100 of 100'), `extract ${extractMs}ms`);
  const t2 = Date.now();
  const hits = await searchPdf(doc, 'Long document page 57 ');
  const searchMs = Date.now() - t2;
  check('long.pdf full-document search', hits.length === 1 && hits[0] === 57, `search 100 pages in ${searchMs}ms`);
}

// --- columns.pdf ---
{
  const doc = await openPdf(fixture('columns.pdf'));
  const { text, normalized, items } = await pageText(doc, 1);
  check('columns.pdf text layer', normalized.includes(normalizeForSearch('left-item-1')) && normalized.includes(normalizeForSearch('right-item-16')));
  const firstLeft = items.findIndex((i) => i.str.includes('left-item-1'));
  const firstRight = items.findIndex((i) => i.str.includes('right-item-1'));
  const leftX = items[firstLeft].x;
  const rightX = items[firstRight].x;
  check('columns.pdf columns have distinct x positions', rightX > leftX * 2, `left x=${leftX}, right x=${rightX}`);
  // reading-order caveat: content-stream order, not visual order
  console.log(`NOTE  columns.pdf item order = content-stream order (first 3: ${items.slice(0, 3).map((i) => i.str.slice(0, 12)).join(' | ')})`);
}

// --- scanned.pdf ---
{
  const doc = await openPdf(fixture('scanned.pdf'));
  const p1 = await pageText(doc, 1);
  check('scanned.pdf has NO text layer (OCR not supported in M0)', p1.items.length === 0, `${p1.items.length} items`);
  check('scanned.pdf still opens & pages accessible', doc.numPages === 1);
}

console.log(failures === 0 ? '\nPDF SPIKE: ALL CHECKS PASSED' : `\nPDF SPIKE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
