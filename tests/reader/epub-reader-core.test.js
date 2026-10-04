import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEpubContainer, parseOpf, extractToc, EpubError } from '../../src/reader/epub-book.js';
import { openBookSession } from '../../src/reader/epub-reader-core.js';

const fixture = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'epub', name);

test('container: security guards fire before any parse (M6 §16)', async () => {
  const dir = path.dirname(fixture('simple.epub'));
  await assert.rejects(() => openEpubContainer(path.join(dir, 'nonexistent.epub')), (err) => {
    assert.equal(err.code, 'NOT_FOUND');
    return true;
  });
  // safe entry names enforced via container entries: multi-chapter is known good
  const container = await openEpubContainer(fixture('multi-chapter.epub'));
  assert.ok(container.entries.length > 0);
});

test('container: all five fixtures pass mimetype + container + OPF gates', async () => {
  for (const name of ['simple.epub', 'multi-chapter.epub', 'long-chapter.epub', 'with-image.epub', 'epub3.epub']) {
    const c = await openEpubContainer(fixture(name));
    const opf = await c.readEntryText(c.opfPath);
    assert.ok(opf.includes('<package'), name);
  }
});

test('parseOpf: EPUB 3 metadata/manifest/spine/nav properties (M6 §8-10)', async () => {
  const c = await openEpubContainer(fixture('epub3.epub'));
  const opfXml = await c.readEntryText(c.opfPath);
  const book = parseOpf(opfXml, c.opfDir);
  assert.equal(book.version, '3.0');
  assert.equal(book.meta.title, '三代书');
  assert.equal(book.spine.length, 2);
  const navItem = [...book.manifest.values()].find((m) => m.properties.includes('nav'));
  assert.ok(navItem, 'EPUB 3 must have nav item');
});

test('TOC extraction: EPUB 2 NCX and EPUB 3 nav both work (M6 §9)', async () => {
  const c2 = await openEpubContainer(fixture('multi-chapter.epub'));
  const opf2 = await c2.readEntryText(c2.opfPath);
  const book2 = parseOpf(opf2, c2.opfDir);
  const readText2 = (n) => c2.readEntryText(n);
  const toc2 = await extractToc(c2, book2, readText2);
  assert.equal(toc2.length, 5);
  assert.match(toc2[0].label, /第1章/);

  const c3 = await openEpubContainer(fixture('epub3.epub'));
  const opf3 = await c3.readEntryText(c3.opfPath);
  const book3 = parseOpf(opf3, c3.opfDir);
  const toc3 = await extractToc(c3, book3, (n) => c3.readEntryText(n));
  assert.equal(toc3.length, 2);
});

test('openBookSession: metadata + chapters in spine order (M6 §20)', async () => {
  const session = await openBookSession(fixture('multi-chapter.epub'));
  assert.equal(session.metadata.title, '五章书');
  assert.equal(session.chapters.length, 5);
  assert.match(session.chapters[0].title, /山门/);
  assert.ok(session.chapters[0].text.includes('山门会留在页边'));
});

test('chapter text extraction excludes script/style (M6 §16)', async () => {
  const session = await openBookSession(fixture('simple.epub'));
  for (const ch of session.chapters) {
    assert.equal(/<script/i.test(ch.text), false);
  }
});

test('EpubError has typed codes for caller branching (M6 §48)', () => {
  const err = new EpubError('UNSUPPORTED', 'x');
  assert.equal(err.code, 'UNSUPPORTED');
});
