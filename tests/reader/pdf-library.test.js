import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { addPdfBook, pdfDocumentPath } from '../../src/reader/pdf-library.js';
import { updateUserState, loadUserState, stateOf, resetCacheForTests } from '../../src/library/user-state.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdf');
const fixture = (name) => path.join(fixtureDir, name);

const setup = async () => {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m7-lib-'));
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-index-${path.basename(lib)}.json`);
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  invalidateSearchIndex();
  return lib;
};

test('addPdfBook: byte-identical copy, type=pdf meta, page_count (M7 §59/§4)', async () => {
  const lib = await setup();
  const { document_id, dir, meta } = await addPdfBook(lib, fixture('text.pdf'));
  assert.equal(meta.type, 'pdf');
  assert.equal(meta.page_count, 5);
  assert.ok(meta.title && meta.title.length > 0, 'title falls back to filename');
  const copied = await fsp.readFile(pdfDocumentPath(dir));
  const original = await fsp.readFile(fixture('text.pdf'));
  assert.deepEqual(copied, original, 'document.pdf must be a byte-identical copy');
  assert.ok(meta.source.content_hash.startsWith('sha256-'));
});

test('addPdfBook: metadata title used when the PDF carries one (M7 §54)', async () => {
  const lib = await setup();
  const tmp = path.join(os.tmpdir(), `reverie-m7-titled-${Date.now()}.pdf`);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  page.drawText('Titled fixture', { x: 40, y: 120, size: 14, font });
  doc.setTitle('河流志·卷一');
  doc.setAuthor('归档员');
  await fsp.writeFile(tmp, await doc.save());
  const { meta } = await addPdfBook(lib, tmp);
  assert.equal(meta.title, '河流志·卷一');
  assert.equal(meta.author, '归档员');
});

test('scan projects pdf_body and page_count; global search finds PDF text (M7 §27)', async () => {
  const lib = await setup();
  await addPdfBook(lib, fixture('text.pdf'));
  await addPdfBook(lib, fixture('cjk.pdf'));
  const { rebuildSearchIndex } = await import('../../src/search/search-service.js');
  await rebuildSearchIndex(lib);
  const { search } = await import('../../src/search/search-service.js');
  const r = await search('heron counts', { libraryRoot: lib });
  assert.equal(r.total, 1, 'PDF body text is globally searchable');
  const rcjk = await search('山门会留在页边', { libraryRoot: lib });
  assert.equal(rcjk.total, 1, 'CJK PDF text is globally searchable');
  const scan = await (await import('../../src/library/scan.js')).scanLibrary(lib);
  const pdfEntry = scan.entries.find((e) => e.type === 'pdf' && e.pdf_body?.includes('heron counts'));
  assert.ok(pdfEntry, 'text.pdf entry carries pdf_body');
  assert.equal(pdfEntry.page_count, 5);
  const cjkEntry = scan.entries.find((e) => e.type === 'pdf' && e.pdf_body?.includes('山门会留在页边'));
  assert.ok(cjkEntry, 'cjk.pdf entry carries pdf_body');
});

test('index rebuild after losing the search index still finds PDF text (M7 §57)', async () => {
  const lib = await setup();
  await addPdfBook(lib, fixture('text.pdf'));
  const { rebuildSearchIndex, search } = await import('../../src/search/search-service.js');
  await rebuildSearchIndex(lib);
  await fsp.rm(process.env.REVERIE_SEARCH_INDEX, { force: true }); // "SQLite deleted"
  await rebuildSearchIndex(lib);
  const r = await search('archive stores what you read', { libraryRoot: lib });
  assert.equal(r.total, 1, 'PDF remains searchable after full index rebuild');
});

test('scanned PDF ingests fine with no body text (M7 §22/§27)', async () => {
  const lib = await setup();
  const { document_id } = await addPdfBook(lib, fixture('scanned.pdf'));
  const { rebuildSearchIndex, search } = await import('../../src/search/search-service.js');
  await rebuildSearchIndex(lib);
  const r = await search('scanned', { libraryRoot: lib });
  // title (filename fallback) still matches; body contributes nothing
  assert.ok(r.results.every((d) => d.document_id === document_id),
    'match comes from metadata only');
  const rBody = await search('the archive stores what you read', { libraryRoot: lib });
  assert.equal(rBody.total, 0, 'no text layer → body search unavailable');
  const scan = await (await import('../../src/library/scan.js')).scanLibrary(lib);
  const entry = scan.entries.find((e) => e.document_id === document_id);
  assert.equal(entry.pdf_body, null, 'metadata/annotations still indexed');
});

test('encrypted PDF ingestion fails with PASSWORD_REQUIRED, not a crash (M7 §17)', async () => {
  const lib = await setup();
  await assert.rejects(
    () => addPdfBook(lib, fixture('encrypted.pdf')),
    (err) => err?.code === 'PASSWORD_REQUIRED',
  );
});

test('reading progress: last_location accepts page_index for PDFs (M7 §40)', async () => {
  const lib = await setup();
  await updateUserState('doc-pdf', { last_location: { page_index: 41, scroll_ratio: 0.3 } });
  assert.deepEqual(stateOf(await loadUserState(), 'doc-pdf').last_location,
    { page_index: 41, scroll_ratio: 0.3 });
  // invalid values still ignored (non-integer / negative)
  await updateUserState('doc-pdf', { last_location: { page_index: -1 } });
  assert.equal(stateOf(await loadUserState(), 'doc-pdf').last_location.page_index, 41);
  // book chapter_index path unchanged (M6 regression guard)
  await updateUserState('doc-book', { last_location: { chapter_index: 2, scroll_ratio: 0.4 } });
  assert.equal(stateOf(await loadUserState(), 'doc-book').last_location.chapter_index, 2);
});
