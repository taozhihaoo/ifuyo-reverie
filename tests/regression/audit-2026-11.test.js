/**
 * Regression tests for the November 2026 code audit (see README/CHANGELOG).
 * Each test pins a bug that was real, silent, and user-visible:
 *
 *  1. `feedId` was forwarded by the renderer but dropped in the main process,
 *     so the sidebar feed filter did nothing.
 *  2. Library rows read `original_url` / `canonical_url`, which the search
 *     projection never returned — the source host was always blank.
 *  3. `fetchPage` validated private hosts AFTER the request went out (and its
 *     rejection path referenced an undefined `signal`).
 *  4. An EPUB without `<dc:title>` crashed with `path is not defined`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rebuildSearchIndex, queryLibrary } from '../../src/search/search-service.js';
import { writeMeta } from '../../src/core/meta.js';
import { writeFileAtomic } from '../../src/core/atomic-write.js';
import { newId } from '../../src/core/ids.js';
import { fetchPage } from '../../src/capture/fetch.js';
import { makeZip } from '../../src/core/zip-writer.js';
import { openBookSession } from '../../src/reader/epub-reader-core.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-audit-'));

async function writeDoc(library, { title, url, feedId = null }) {
  const documentId = newId();
  const now = new Date().toISOString();
  const dir = path.join(library, 'articles', '2026', documentId);
  await writeMeta(dir, {
    format_version: 1,
    document_id: documentId,
    type: 'article',
    title,
    author: 'Audit Tester',
    created_at: now,
    captured_at: now,
    updated_at: now,
    feed_id: feedId,
    source: {
      original_url: url,
      capture_time: now,
      extractor: { name: 'readability', version: '0.6.0' },
      canonical_url: url,
    },
  });
  await writeFileAtomic(path.join(dir, 'article.md'), `# ${title}\n\nbody for ${title}\n`);
  return documentId;
}

test('queryLibrary: feedId filters documents and the projection carries the source URL', async () => {
  const library = await tmpdir();
  const saved = process.env.REVERIE_LIBRARY;
  process.env.REVERIE_LIBRARY = library;
  process.env.REVERIE_SEARCH_INDEX = path.join(library, '..', `si-${Date.now()}.json`);
  try {
    await writeDoc(library, { title: 'From feed A', url: 'https://a.example.com/one', feedId: 'feed-a' });
    await writeDoc(library, { title: 'From feed B', url: 'https://b.example.com/two', feedId: 'feed-b' });
    await rebuildSearchIndex(library);

    const all = await queryLibrary('', { view: 'all', libraryRoot: library });
    assert.equal(all.total, 2, 'no filter → both documents');

    const onlyA = await queryLibrary('', { view: 'all', feedId: 'feed-a', libraryRoot: library });
    assert.equal(onlyA.total, 1);
    assert.equal(onlyA.results[0].title, 'From feed A');
    assert.equal(onlyA.results[0].feed_id, 'feed-a');

    // the renderer reads e.original_url ?? e.canonical_url to print the host
    assert.equal(onlyA.results[0].original_url, 'https://a.example.com/one');
    assert.equal(onlyA.results[0].canonical_url, 'https://a.example.com/one');

    const none = await queryLibrary('', { view: 'all', feedId: 'feed-missing', libraryRoot: library });
    assert.equal(none.total, 0);
  } finally {
    if (saved === undefined) delete process.env.REVERIE_LIBRARY;
    else process.env.REVERIE_LIBRARY = saved;
    await fsp.rm(library, { recursive: true, force: true });
  }
});

test('fetchPage refuses a private host before any request is made', async () => {
  const saved = process.env.REVERIE_ALLOW_PRIVATE_NETWORK;
  delete process.env.REVERIE_ALLOW_PRIVATE_NETWORK;
  try {
    // Nothing listens on this port: a NETWORK_ERROR would prove we tried to
    // connect. A SECURITY_REJECTED proves the guard ran first.
    await assert.rejects(
      fetchPage('http://127.0.0.1:9/never'),
      (err) => err.code === 'SECURITY_REJECTED' && /loopback|private/i.test(err.message),
    );
  } finally {
    if (saved !== undefined) process.env.REVERIE_ALLOW_PRIVATE_NETWORK = saved;
  }
});

test('EPUB without dc:title opens (falls back to the file name)', async () => {
  const dir = await tmpdir();
  const enc = new TextEncoder();
  const epubPath = path.join(dir, 'untitled-book.epub');
  const zip = makeZip([
    { name: 'mimetype', data: enc.encode('application/epub+zip') },
    {
      name: 'META-INF/container.xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    },
    {
      name: 'OEBPS/content.opf',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:00000000-0000-4000-8000-000000000001</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`),
    },
    {
      name: 'OEBPS/c1.xhtml',
      data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><p>Hello.</p></body></html>'),
    },
  ]);
  await fsp.writeFile(epubPath, zip);
  try {
    const session = await openBookSession(epubPath);
    assert.equal(session.metadata.title, 'untitled-book', 'falls back to the file base name');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
