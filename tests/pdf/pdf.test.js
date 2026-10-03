import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPdf, pageText, searchPdf, normalizeForSearch } from '../../spikes/pdf/lib.mjs';

const fixture = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdf', name);

test('pdf.js opens text PDF, page model + text layer intact', async () => {
  const doc = await openPdf(fixture('text.pdf'));
  assert.equal(doc.numPages, 5);
  const p1 = await pageText(doc, 1);
  assert.ok(p1.normalized.length > 400);
  assert.ok(p1.normalized.includes(normalizeForSearch('Paragraph 1:')));
  assert.ok(p1.items.length >= 10 && p1.items.every((i) => Number.isFinite(i.x) && Number.isFinite(i.y)));
});

test('pdf.js cross-page search finds term on every page', async () => {
  const doc = await openPdf(fixture('text.pdf'));
  const hits = await searchPdf(doc, 'heron counts');
  assert.deepEqual(hits, [1, 2, 3, 4, 5]);
});

test('long PDF: random page access + full-document search stay fast', async () => {
  const doc = await openPdf(fixture('long.pdf'));
  assert.equal(doc.numPages, 100);
  const p100 = await pageText(doc, 100);
  assert.ok(p100.normalized.includes(normalizeForSearch('page 100 of 100')));
  const hits = await searchPdf(doc, 'Long document page 57');
  assert.deepEqual(hits, [57]);
});

test('multi-column PDF: text layer complete, columns distinguishable by x', async () => {
  const doc = await openPdf(fixture('columns.pdf'));
  const { normalized, items } = await pageText(doc, 1);
  for (const t of ['left-item-1', 'left-item-6', 'right-item-11', 'right-item-16']) {
    assert.ok(normalized.includes(t), `missing ${t}`);
  }
  const leftX = items.find((i) => i.str.includes('left-item-1')).x;
  const rightX = items.find((i) => i.str.includes('right-item-11')).x;
  assert.ok(rightX > leftX * 2);
  // known caveat: item order = content-stream order, not visual reading order
});

test('scanned PDF: zero text items, does not error (OCR not supported in M0)', async () => {
  const doc = await openPdf(fixture('scanned.pdf'));
  assert.equal(doc.numPages, 1);
  const p1 = await pageText(doc, 1);
  assert.equal(p1.items.length, 0);
});
