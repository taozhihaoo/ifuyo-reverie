import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEpubBook, bookEpubPath } from '../../src/reader/book-library.js';
import { openBookSession, bookCanonicalText, chapterSanitizedXhtml } from '../../src/reader/epub-reader-core.js';
import { createAnnotationService } from '../../src/annotation/service.js';
import { readAnnotationsFile } from '../../src/annotation/store.js';
import { rebuildSearchIndex, search } from '../../src/search/search-service.js';
import { updateUserState, loadUserState, stateOf } from '../../src/library/user-state.js';
import { resetCacheForTests } from '../../src/library/user-state.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'epub');
const fixture = (name) => path.join(fixtureDir, name);
const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m6-'));

const setup = async () => {
  const lib = await tmpdir();
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-index-${path.basename(lib)}.json`);
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  invalidateSearchIndex();
  return lib;
};

test('addEpubBook: copies file immutably, writes type=book meta (M6 §17)', async () => {
  const lib = await setup();
  const { document_id, dir, meta } = await addEpubBook(lib, fixture('multi-chapter.epub'));
  assert.equal(meta.type, 'book');
  assert.equal(meta.title, '五章书');
  const copied = await fsp.readFile(bookEpubPath(dir));
  const original = await fsp.readFile(fixture('multi-chapter.epub'));
  assert.deepEqual(copied, original, 'book.epub must be a byte-identical copy');
  // scan picks it up with book body text
  await rebuildSearchIndex(lib);
  const index = await loadSearchIndexSafe(lib);
  const entry = index.documents.find((d) => d.document_id === document_id);
  assert.ok(entry, 'book indexed');
  assert.ok(entry.body.includes('山门会留在页边'), 'book body searchable');
});

test('annotations on books: M2 core with canonical text + chapter sanitization (M6 §81)', async () => {
  const lib = await setup();
  const { document_id, dir } = await addEpubBook(lib, fixture('multi-chapter.epub'));
  const session = await openBookSession(bookEpubPath(dir));
  const canonical = bookCanonicalText(session);
  const service = createAnnotationService({
    articleDir: dir,
    documentId: document_id,
    getReaderContext: async () => ({ canonicalText: canonical, contentHash: undefined }),
  });
  const quote = '山门会留在页边';
  const start = canonical.indexOf(quote);
  assert.ok(start !== -1);
  const { annotation } = await service.createHighlight({
    anchor: {
      quote,
      prefix: canonical.slice(Math.max(0, start - 32), start),
      suffix: canonical.slice(start + quote.length, start + quote.length + 32),
      position: { start, end: start + quote.length },
    },
    note: 'EPUB 笔记',
  });
  assert.equal(annotation.type, 'highlight');
  // chapter XHTML is sanitized for renderer
  const xhtml = await chapterSanitizedXhtml(session.container, session.chapters[0].href);
  assert.equal(/<script/i.test(xhtml), false);
  assert.ok(xhtml.includes('山门'));
});

test('book search: chapter text findable via global search (M6 §28)', async () => {
  const lib = await setup();
  await addEpubBook(lib, fixture('multi-chapter.epub'));
  await rebuildSearchIndex(lib);
  const r = await search('溪谷', { libraryRoot: lib });
  assert.equal(r.total, 1);
});

test('reading progress: last_location round-trips in user state (M6 §26)', async () => {
  const lib = await setup();
  await updateUserState('doc-book', { last_location: { chapter_index: 2, scroll_ratio: 0.4 } });
  const st = stateOf(await loadUserState(), 'doc-book');
  assert.equal(st.last_location.chapter_index, 2);
  assert.equal(st.last_location.scroll_ratio, 0.4);
  // invalid location ignored
  await updateUserState('doc-book', { last_location: { chapter_index: -5 } });
  assert.equal(stateOf(await loadUserState(), 'doc-book').last_location.chapter_index, 2);
});

test('book.epub immutability: annotations live beside, never inside (M6 §17)', async () => {
  const lib = await setup();
  const { document_id, dir } = await addEpubBook(lib, fixture('multi-chapter.epub'));
  const epubBefore = await fsp.readFile(bookEpubPath(dir));
  const session = await openBookSession(bookEpubPath(dir));
  const canonical = bookCanonicalText(session);
  const service = createAnnotationService({
    articleDir: dir, documentId: document_id,
    getReaderContext: async () => ({ canonicalText: canonical }),
  });
  const quote = '溪谷';
  const start = canonical.indexOf(quote);
  const { annotation } = await service.createHighlight({
    anchor: {
      quote,
      prefix: canonical.slice(Math.max(0, start - 32), start),
      suffix: canonical.slice(start + quote.length, start + quote.length + 32),
      position: { start, end: start + quote.length },
    },
  });
  await service.updateNote(annotation.annotation_id, 'note on book');
  const epubAfter = await fsp.readFile(bookEpubPath(dir));
  assert.deepEqual(epubAfter, epubBefore, 'book.epub must never be modified');
  const { annotations } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].note, 'note on book');
});

async function loadSearchIndexSafe(lib) {
  const { loadSearchIndex } = await import('../../src/search/search-service.js');
  return loadSearchIndex(lib);
}
