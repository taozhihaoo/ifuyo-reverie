import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
// load the renderer's script (same file the app loads) — ESM-safe
await import('../../app/renderer/reader-anchor.js');
const ReaderAnchor = globalThis.ReaderAnchor;
import { addEpubBook, bookEpubPath } from '../../src/reader/book-library.js';
import { openBookSession, bookCanonicalText } from '../../src/reader/epub-reader-core.js';
import { createAnnotationService } from '../../src/annotation/service.js';
import { readAnnotationsFile } from '../../src/annotation/store.js';
import { rebuildSearchIndex, search } from '../../src/search/search-service.js';
import { resetCacheForTests } from '../../src/library/user-state.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'epub');
const fixture = (name) => path.join(fixtureDir, name);

const setup = async () => {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m6-flow-'));
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-index-${path.basename(lib)}.json`);
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  invalidateSearchIndex();
  return lib;
};

/** Mirror of app.js renderBookChapters: the exact DOM the renderer builds. */
function renderBookInDom(session) {
  const dom = new JSDOM('<!doctype html><html><body><div id="reader-content"></div></body></html>');
  const content = dom.window.document.getElementById('reader-content');
  for (const ch of session.chapters) {
    const section = dom.window.document.createElement('section');
    section.className = 'book-chapter';
    section.dataset.chapterIndex = String(ch.index);
    const body = dom.window.document.createElement('div');
    body.className = 'book-chapter-body';
    body.innerHTML = ch.xhtml; // same sanitized XHTML main sends over IPC
    section.appendChild(body);
    content.appendChild(section);
  }
  return { dom, content };
}

test('书籍高亮创建→重启→恢复：main 与 renderer 共享同一文本，偏移直读 (M6 §33/§38)', async () => {
  const lib = await setup();
  const { document_id, dir } = await addEpubBook(lib, fixture('multi-chapter.epub'));

  // ---------- session 1: renderer renders, user highlights + bookmarks ----------
  const session1 = await openBookSession(bookEpubPath(dir));
  const canonical1 = bookCanonicalText(session1);

  const { content } = renderBookInDom(session1);
  assert.equal(
    content.textContent,
    canonical1,
    'renderer DOM textContent must equal canonical text byte-for-byte',
  );

  // user selects through the REAL renderer mapping (offsets -> Range -> anchor)
  const quote = '夜灯会留在页边';
  const start = canonical1.indexOf(quote);
  assert.ok(start !== -1, 'quote present in canonical text');
  const range = ReaderAnchor.rangeForOffsets(content, start, start + quote.length);
  assert.ok(range, 'rangeForOffsets resolves in the rendered book DOM');
  assert.equal(range.toString(), quote);
  const parts = ReaderAnchor.selectionParts(range, content);
  assert.equal(parts.quote, quote);

  const service1 = createAnnotationService({
    articleDir: dir,
    documentId: document_id,
    getReaderContext: async () => ({ canonicalText: canonical1 }),
  });
  const { annotation } = await service1.createHighlight({ anchor: parts, note: '重启恢复' });
  const { annotation: bookmark } = await service1.createBookmark({
    location: { chapter_index: 2, scroll_ratio: 0.42 },
    note: '看到这里',
  });
  assert.equal(annotation.type, 'highlight');
  assert.equal(bookmark.type, 'bookmark');

  // ---------- restart: fresh session + fresh service, nothing in memory ----------
  const session2 = await openBookSession(bookEpubPath(dir));
  const canonical2 = bookCanonicalText(session2);
  assert.equal(canonical2, canonical1, 'canonical text is deterministic across restarts');

  const service2 = createAnnotationService({
    articleDir: dir,
    documentId: document_id,
    getReaderContext: async () => ({ canonicalText: canonical2 }),
  });
  const { annotations } = await service2.listResolved();

  const hl = annotations.find((a) => a.annotation_id === annotation.annotation_id);
  assert.equal(hl.status, 'resolved', 'highlight survives restart');
  assert.equal(hl.locator.position.start, start);
  assert.equal(hl.locator.position.end, start + quote.length);
  assert.equal(hl.note, '重启恢复');

  const bm = annotations.find((a) => a.annotation_id === bookmark.annotation_id);
  assert.equal(bm.type, 'bookmark');
  assert.equal(bm.status, 'resolved', 'bookmark keeps resolved without a text anchor');
  assert.deepEqual(bm.locator.location, { chapter_index: 2, scroll_ratio: 0.42 });

  // restored offsets map back into the re-rendered DOM (restore round trip)
  const range2 = ReaderAnchor.rangeForOffsets(content, hl.locator.position.start, hl.locator.position.end);
  assert.ok(range2, 'restored highlight renders again');
  assert.equal(range2.toString(), quote);

  // persisted beside book.epub: one highlight + one bookmark
  const { annotations: raw } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
  assert.equal(raw.length, 2);
  const epubAfter = await fsp.readFile(bookEpubPath(dir));
  const epubBefore = await fsp.readFile(fixture('multi-chapter.epub'));
  assert.deepEqual(epubAfter, epubBefore, 'book.epub untouched by the whole flow');

  // index rebuild keeps the book searchable
  await rebuildSearchIndex(lib);
  const r = await search('夜灯', { libraryRoot: lib });
  assert.equal(r.total, 1);
});
