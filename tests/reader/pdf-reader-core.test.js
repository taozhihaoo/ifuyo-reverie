import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openPdfDocument, closePdfDocument, extractPdfPages, extractPdfMeta,
  extractPdfOutline, extractPdfPageLabels, pdfCanonicalText, pdfPageSpans,
  pageForOffset, PdfError, PDF_ERROR_CODES,
} from '../../src/reader/pdf-reader-core.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdf');
const fixture = (name) => path.join(fixtureDir, name);

const withDoc = async (name, fn) => {
  const doc = await openPdfDocument(fixture(name));
  try {
    return await fn(doc);
  } finally {
    await closePdfDocument(doc);
  }
};

test('PdfError typed codes cover the M7 error surface (M7 §81)', () => {
  for (const code of PDF_ERROR_CODES) {
    const err = new PdfError(code, 'x');
    assert.equal(err.code, code);
    assert.equal(err.error_code, code); // dual spelling convention
  }
});

test('openPdfDocument: page model of a plain text PDF (M7 §9)', async () => {
  await withDoc('text.pdf', async (doc) => {
    assert.equal(doc.numPages, 5);
    const pages = await extractPdfPages(doc);
    assert.equal(pages.length, 5);
    assert.ok(pages[0].text.includes('Paragraph 1:'));
    assert.ok(pages[0].width > 0 && pages[0].height > 0, 'page geometry present');
    assert.equal(pages[0].rotation, 0);
    const labels = await extractPdfPageLabels(doc);
    assert.equal(labels, null, 'no labels defined → display falls back to index+1');
  });
});

test('canonical text = Σ page text, spans map offsets to pages (M7 §13)', async () => {
  await withDoc('long.pdf', async (doc) => {
    const pages = await extractPdfPages(doc);
    assert.equal(pages.length, 100);
    const canonical = pdfCanonicalText(pages);
    const spans = pdfPageSpans(pages);
    assert.equal(spans.length, 100);
    assert.equal(spans[99].end, canonical.length);
    const marker = canonical.indexOf('page 57 of 100');
    assert.ok(marker !== -1);
    assert.equal(pageForOffset(spans, marker), 56);
    assert.equal(pageForOffset(spans, spans[0].end + 5), 1);
    // page text contains its own page number only on that page
    const p56 = pages[56].text;
    assert.ok(p56.includes('page 57 of 100'));
    assert.ok(!pages[55].text.includes('page 57 of 100'));
  });
});

test('CJK text layer extracts Chinese + Latin from embedded font (M7 §68)', async () => {
  await withDoc('cjk.pdf', async (doc) => {
    const pages = await extractPdfPages(doc);
    const text = pdfCanonicalText(pages);
    assert.ok(text.includes('山门会留在页边'), 'Chinese extracted');
    assert.ok(text.includes('Reverie keeps what you read'), 'mixed Latin extracted');
    assert.ok(text.includes('溪谷会留在记忆里'));
  });
});

test('scanned PDF (no text layer): opens, pages readable, text empty (M7 §22)', async () => {
  await withDoc('scanned.pdf', async (doc) => {
    const pages = await extractPdfPages(doc);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].text, '');
  });
});

test('outline: nested nodes resolve to page indices (M7 §18)', async () => {
  await withDoc('outline.pdf', async (doc) => {
    const outline = await extractPdfOutline(doc);
    assert.equal(outline.length, 2);
    assert.equal(outline[0].title, '第一部分 阅读的方式');
    assert.equal(outline[0].page_index, 0);
    assert.equal(outline[0].children.length, 2);
    assert.equal(outline[0].children[0].title, '第一章 溪谷');
    assert.equal(outline[0].children[0].page_index, 1);
    assert.equal(outline[0].children[1].page_index, 2);
    assert.equal(outline[1].title, '第二部分 归途');
    assert.equal(outline[1].page_index, 3);
    assert.equal(outline[1].children.length, 0);
  });
});

test('mixed page sizes: geometry is per page (M7 §47)', async () => {
  await withDoc('mixed-size.pdf', async (doc) => {
    const pages = await extractPdfPages(doc);
    assert.equal(pages.length, 3);
    assert.deepEqual([pages[0].width, pages[0].height], [595, 842]);
    assert.deepEqual([pages[1].width, pages[1].height], [842, 595]);
    assert.deepEqual([pages[2].width, pages[2].height], [400, 400]);
  });
});

test('rotated page: rotation preserved, text still extractable (M7 §48)', async () => {
  await withDoc('rotated.pdf', async (doc) => {
    const pages = await extractPdfPages(doc);
    assert.equal(pages[0].rotation, 0);
    assert.equal(pages[1].rotation, 90);
    assert.ok(pages[1].text.includes('Rotated page 90'));
  });
});

test('metadata: info dict fields surface with null fallback (M7 §54)', async () => {
  await withDoc('text.pdf', async (doc) => {
    const meta = await extractPdfMeta(doc);
    assert.equal(meta.title, null); // fixture has no Title → filename fallback at ingest
    assert.equal(typeof meta.producer, 'string' || null);
  });
});

test('password-protected PDF → PASSWORD_REQUIRED, never a parse error (M7 §17)', async () => {
  await assert.rejects(
    () => openPdfDocument(fixture('encrypted.pdf')),
    (err) => err instanceof PdfError && err.code === 'PASSWORD_REQUIRED',
  );
});

test('corrupted PDF (valid header) → CORRUPTED', async () => {
  const tmp = path.join(os.tmpdir(), `reverie-m7-corrupt-${Date.now()}.pdf`);
  const buf = await fsp.readFile(fixture('text.pdf'));
  // truncate the xref/trailer away: header survives, structure does not
  await fsp.writeFile(tmp, buf.subarray(0, 100));
  try {
    await assert.rejects(
      () => openPdfDocument(tmp),
      (err) => err instanceof PdfError && err.code === 'CORRUPTED',
    );
  } finally {
    await fsp.rm(tmp, { force: true });
  }
});

test('non-PDF file → NOT_PDF; missing file → NOT_FOUND (M7 §81)', async () => {
  const tmp = path.join(os.tmpdir(), `reverie-m7-junk-${Date.now()}.pdf`);
  await fsp.writeFile(tmp, 'this is not a pdf at all');
  try {
    await assert.rejects(
      () => openPdfDocument(tmp),
      (err) => err instanceof PdfError && err.code === 'NOT_PDF',
    );
  } finally {
    await fsp.rm(tmp, { force: true });
  }
  await assert.rejects(
    () => openPdfDocument(path.join(os.tmpdir(), 'does-not-exist.pdf')),
    (err) => err instanceof PdfError && err.code === 'NOT_FOUND',
  );
});

test('resource guards: file size and page limits are enforced (M7 §14)', async () => {
  await assert.rejects(
    () => openPdfDocument(fixture('text.pdf'), { ...{ maxFileBytes: 10, maxPages: 20000, maxCanonicalChars: 1e7 } }),
    (err) => err instanceof PdfError && err.code === 'TOO_LARGE',
  );
  await assert.rejects(
    () => openPdfDocument(fixture('text.pdf'), { ...{ maxFileBytes: 1e9, maxPages: 2, maxCanonicalChars: 1e7 } }),
    (err) => err instanceof PdfError && err.code === 'PAGE_LIMIT',
  );
});
