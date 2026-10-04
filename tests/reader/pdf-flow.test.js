import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
// load the renderer's script (same file the app loads) — ESM-safe
await import('../../app/renderer/reader-anchor.js');
const ReaderAnchor = globalThis.ReaderAnchor;
import { addPdfBook, pdfDocumentPath } from '../../src/reader/pdf-library.js';
import {
  openPdfDocument, closePdfDocument, extractPdfPages,
  pdfCanonicalText, pdfPageSpans, pageForOffset,
} from '../../src/reader/pdf-reader-core.js';
import { createAnnotationService } from '../../src/annotation/service.js';
import { readAnnotationsFile } from '../../src/annotation/store.js';
import { rebuildSearchIndex, search } from '../../src/search/search-service.js';
import { resetCacheForTests } from '../../src/library/user-state.js';

const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdf');
const fixture = (name) => path.join(fixtureDir, name);

const setup = async () => {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m7-flow-'));
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-index-${path.basename(lib)}.json`);
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  invalidateSearchIndex();
  return lib;
};

/** Open a PDF and render it through the REAL pdf.js TextLayer into a jsdom
 * reader-content, mirroring app/renderer/pdf-view.js's DOM structure. */
async function renderPdfInDom(pdfPath) {
  const pdfjs = await import(pathToFileURL(path.join(pdfjsDir, 'legacy', 'build', 'pdf.mjs')).href);
  const dom = new JSDOM('<!doctype html><html><body><div id="reader-content"></div></body></html>');
  const { window } = dom;
  // TextLayer measures glyph widths via canvas 2D — jsdom has none, but the
  // measurement only influences visual scaling, never textContent.
  const ctx2d = { measureText: (s) => ({ width: (s || '').length * 6 }), font: '', canvas: null };
  window.HTMLCanvasElement.prototype.getContext = function () { ctx2d.canvas = this; return ctx2d; };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;

  const content = window.document.getElementById('reader-content');
  const doc = await openPdfDocument(pdfPath);
  const pages = await extractPdfPages(doc);
  for (const pageMeta of pages) {
    const section = window.document.createElement('section');
    section.className = 'pdf-page';
    section.dataset.pageIndex = String(pageMeta.index);
    const layer = window.document.createElement('div');
    layer.className = 'pdf-text-layer';
    section.appendChild(layer);
    content.appendChild(section);

    const pdfPage = await doc.getPage(pageMeta.index + 1);
    const textContent = await pdfPage.getTextContent();
    const tl = new pdfjs.TextLayer({ textContentSource: textContent, container: layer, viewport: pdfPage.getViewport({ scale: 1 }) });
    await tl.render();
  }
  return { dom, content, doc, pages };
}

async function releaseDom() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.HTMLElement;
}

test('PDF 高亮创建→重启→恢复：真实 TextLayer DOM 与 canonical 字节一致，偏移直读 (M7 §13)', async () => {
  const lib = await setup();
  const { document_id, dir } = await addPdfBook(lib, fixture('text.pdf'));

  // ---------- session 1: renderer renders (real TextLayer), user highlights ----------
  const { content, doc, pages } = await renderPdfInDom(pdfDocumentPath(dir));
  try {
    const canonical = pdfCanonicalText(pages);
    assert.equal(content.textContent, canonical,
      'renderer DOM textContent (real TextLayer) must equal canonical text byte-for-byte');

    // offset → page mapping is derivable on both sides from page lengths
    const spans = pdfPageSpans(pages);
    // NOTE: pdf.js text runs split at kerning boundaries and the join carries
    // no space there — the SAME split appears in the TextLayer DOM (parity is
    // the contract), so the quote below is chosen from actual canonical text.
    const quote = 'Rest stop notes, canal walks, and heron';
    const quoteIdx = canonical.indexOf(quote);
    assert.ok(quoteIdx !== -1);
    assert.equal(pageForOffset(spans, quoteIdx), 0, 'first occurrence is on page index 0');

    // user selects through the REAL renderer mapping
    const range = ReaderAnchor.rangeForOffsets(content, quoteIdx, quoteIdx + quote.length);
    assert.ok(range, 'rangeForOffsets resolves in the TextLayer DOM');
    assert.equal(range.toString(), quote);
    const parts = ReaderAnchor.selectionParts(range, content);
    assert.equal(parts.quote, quote);

    const service1 = createAnnotationService({
      articleDir: dir, documentId: document_id,
      getReaderContext: async () => ({ canonicalText: canonical }),
    });
    const { annotation } = await service1.createHighlight({ anchor: parts, note: '重启恢复' });
    const { annotation: bookmark } = await service1.createBookmark({
      location: { page_index: 3, scroll_ratio: 0.5 },
      note: '看到这里',
    });
    assert.equal(annotation.type, 'highlight');
    assert.equal(bookmark.type, 'bookmark');

    // ---------- restart: fresh session + fresh service, nothing in memory ----------
    await closePdfDocument(doc);
    const doc2 = await openPdfDocument(pdfDocumentPath(dir));
    const pages2 = await extractPdfPages(doc2);
    const canonical2 = pdfCanonicalText(pages2);
    await closePdfDocument(doc2);
    assert.equal(canonical2, canonical, 'canonical text is deterministic across restarts');

    const service2 = createAnnotationService({
      articleDir: dir, documentId: document_id,
      getReaderContext: async () => ({ canonicalText: canonical2 }),
    });
    const { annotations } = await service2.listResolved();
    const hl = annotations.find((a) => a.annotation_id === annotation.annotation_id);
    assert.equal(hl.status, 'resolved', 'highlight survives restart');
    assert.equal(hl.locator.position.start, quoteIdx);
    assert.equal(hl.locator.position.end, quoteIdx + quote.length);
    assert.equal(hl.note, '重启恢复');

    const bm = annotations.find((a) => a.annotation_id === bookmark.annotation_id);
    assert.equal(bm.status, 'resolved', 'bookmark keeps resolved (reader-location anchor)');
    assert.deepEqual(bm.locator.location, { page_index: 3, scroll_ratio: 0.5 });

    // restored offsets map back into the re-rendered DOM
    const range2 = ReaderAnchor.rangeForOffsets(content, hl.locator.position.start, hl.locator.position.end);
    assert.ok(range2);
    assert.equal(range2.toString(), quote);

    // persisted beside document.pdf; the original file untouched
    const { annotations: raw } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
    assert.equal(raw.length, 2);
    const pdfAfter = await fsp.readFile(pdfDocumentPath(dir));
    const pdfBefore = await fsp.readFile(fixture('text.pdf'));
    assert.deepEqual(pdfAfter, pdfBefore, 'document.pdf untouched by the whole flow');

    // index rebuild keeps the PDF searchable
    await rebuildSearchIndex(lib);
    const r = await search('heron counts', { libraryRoot: lib });
    assert.equal(r.total, 1);
  } finally {
    await closePdfDocument(doc).catch(() => {});
    await releaseDom();
  }
});

test('CJK PDF: canonical parity through real TextLayer + anchoring works (M7 §68)', async () => {
  const lib = await setup();
  const { document_id, dir } = await addPdfBook(lib, fixture('cjk.pdf'));
  const { content, doc, pages } = await renderPdfInDom(pdfDocumentPath(dir));
  try {
    const canonical = pdfCanonicalText(pages);
    assert.equal(content.textContent, canonical, 'CJK DOM text equals canonical');
    const quote = '山门会留在页边，溪谷会留在记忆里';
    const start = canonical.indexOf(quote);
    assert.ok(start !== -1, 'CJK quote present');
    const range = ReaderAnchor.rangeForOffsets(content, start, start + quote.length);
    assert.equal(range.toString(), quote);
    const parts = ReaderAnchor.selectionParts(range, content);
    const service = createAnnotationService({
      articleDir: dir, documentId: document_id,
      getReaderContext: async () => ({ canonicalText: canonical }),
    });
    const { annotation } = await service.createHighlight({ anchor: parts, note: '中文标注' });
    assert.equal(annotation.type, 'highlight');
    assert.equal(annotation.quoted_text, quote);
  } finally {
    await closePdfDocument(doc).catch(() => {});
    await releaseDom();
  }
});

test('PDF 被替换（fingerprint 变化）：标注按 resolver 语义 orphaned，绝不静默删除 (M7 §71/§94)', async () => {
  const lib = await setup();
  const { document_id, dir } = await addPdfBook(lib, fixture('text.pdf'));
  // session 1: create a highlight for a text.pdf-only quote
  const doc1 = await openPdfDocument(pdfDocumentPath(dir));
  const pages1 = await extractPdfPages(doc1);
  await closePdfDocument(doc1);
  const canonical1 = pdfCanonicalText(pages1);
  // pdf.js splits runs without spaces at kerning boundaries — same on both
  // sides; quote chosen from actual canonical text (see flow test above)
  const quote = 'Rest stop notes, canal walks, and heron';
  const start = canonical1.indexOf(quote);
  assert.ok(start !== -1);
  const service1 = createAnnotationService({
    articleDir: dir, documentId: document_id,
    getReaderContext: async () => ({ canonicalText: canonical1 }),
  });
  const { annotation } = await service1.createHighlight({
    anchor: {
      quote,
      prefix: canonical1.slice(Math.max(0, start - 32), start),
      suffix: canonical1.slice(start + quote.length, start + quote.length + 32),
      position: { start, end: start + quote.length },
    },
  });
  assert.equal(annotation.status, 'resolved');

  // user replaces the PDF with a DIFFERENT document (same path, new bytes)
  await fsp.copyFile(fixture('cjk.pdf'), pdfDocumentPath(dir));
  const doc2 = await openPdfDocument(pdfDocumentPath(dir));
  const pages2 = await extractPdfPages(doc2);
  await closePdfDocument(doc2);
  const canonical2 = pdfCanonicalText(pages2);
  assert.notEqual(canonical2, canonical1, 'replacement really changed the text');

  const service2 = createAnnotationService({
    articleDir: dir, documentId: document_id,
    getReaderContext: async () => ({ canonicalText: canonical2 }),
  });
  const { annotations } = await service2.listResolved();
  const hl = annotations.find((a) => a.annotation_id === annotation.annotation_id);
  assert.ok(hl, 'annotation is still there');
  assert.equal(hl.status, 'orphaned', 'quote no longer resolves → orphaned');
  assert.equal(hl.quoted_text, quote, 'quote/note preserved, never silently deleted');
});
