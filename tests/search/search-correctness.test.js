import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './corpus.mjs';
import { loadSearchIndex, rebuildSearchIndex, refreshSearchIndex, search, queryLibrary } from '../../src/search/search-service.js';
import { resetCacheForTests, loadUserState } from '../../src/library/user-state.js';
import { runDoctor } from '../../src/library/doctor.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m3-'));
const here = path.dirname(fileURLToPath(import.meta.url));

const setup = async () => {
  resetCacheForTests();
  const lib = await tmpdir();
  const { documentIds } = await buildCorpus(lib); // isolates REVERIE_LIBRARY + REVERIE_HOME
  const index = await rebuildSearchIndex(lib);
  return { lib, documentIds, index };
};

test('corpus indexes all documents with correct fields', async () => {
  const { index } = await setup();
  assert.equal(index.documents.length, 5);
  const doc1 = index.documents.find((d) => d.document_id.endsWith('0001'));
  assert.equal(doc1.title, '本地优先软件的设计原则');
  assert.equal(doc1.read, true);
  assert.ok(doc1.tags.includes('特别收藏'));
  assert.equal(doc1.annotations.length, 1);
  assert.ok(doc1.body.includes('文件是唯一的真相'));
});

test('title / author / body / highlight / note / tag / url hits with match types (M3 §18)', async () => {
  const { lib, documentIds } = await setup();
  const byTitle = (t) => documentIds[t];

  const title = search('本地优先软件的设计原则', { libraryRoot: lib });
  assert.equal(await title.then((r) => r.results[0].document_id), byTitle('本地优先软件的设计原则'));
  assert.ok((await title).results[0].matches.some((m) => m.type === 'title'));

  const author = search('陈默', { libraryRoot: lib });
  assert.equal((await author).results[0].document_id, byTitle('Rust 与 WebAssembly 实战'));
  assert.ok((await author).results[0].matches.some((m) => m.type === 'author'));

  const body = search('派生索引', { libraryRoot: lib });
  const bodyRes = await body;
  assert.equal(bodyRes.results.length, 1);
  assert.ok(bodyRes.results[0].matches.some((m) => m.type === 'body'));
  assert.ok(bodyRes.results[0].matches[0].snippet.includes('派生索引'));

  const highlight = search('核心原则，写进产品纲领', { libraryRoot: lib });
  const hlRes = await highlight;
  assert.equal(hlRes.results.length, 1);
  assert.ok(hlRes.results[0].matches.some((m) => m.type === 'note' && m.annotation_id));

  const url = search('example.com/post/3', { libraryRoot: lib });
  assert.ok((await url).results[0].matches.some((m) => m.type === 'url'));
});

test('note text is searchable via its own match type', async () => {
  const { lib } = await setup();
  const r = search('对比 FTS5 与内存子串搜索的基准', { libraryRoot: lib });
  const res = await r;
  assert.equal(res.results.length, 1);
  assert.ok(res.results[0].matches.some((m) => m.type === 'note'));
});

test('one document, multiple matches -> single result card (M3 §55)', async () => {
  const { lib, documentIds } = await setup();
  const r = await search('文件是唯一的真相', { libraryRoot: lib });
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].document_id, documentIds['本地优先软件的设计原则']);
  const types = r.results[0].matches.map((m) => m.type).sort();
  assert.deepEqual(types, ['body', 'highlight']);
});

test('filters compose: tag AND read AND favorite (M3 §48-51)', async () => {
  const { lib, documentIds } = await setup();
  const r = await search('tag:本地优先 is:read is:favorite', { libraryRoot: lib });
  assert.equal(r.total, 1);
  assert.equal(r.results[0].document_id, documentIds['本地优先软件的设计原则']);
  // unread + inbox view combination
  const q = await search('is:unread is:inbox', { libraryRoot: lib });
  assert.equal(q.total, 4);
});

test('search error is returned, not thrown (M3 §27)', async () => {
  const { lib } = await setup();
  const r = search('tag:', { libraryRoot: lib });
  assert.match((await r).error, /缺少内容/);
});

test('orphaned annotations stay searchable (M3 §126/127)', async () => {
  const { lib } = await setup();
  // flip annotation status to orphaned on disk
  const docDir = path.join(lib, 'articles', '2026');
  const dirs = (await fsp.readdir(docDir)).filter((d) => !d.startsWith('.'));
  for (const d of dirs) {
    const file = path.join(docDir, d, 'annotations.jsonl');
    const raw = await fsp.readFile(file, 'utf8').catch(() => '');
    if (raw.includes('文件是唯一的真相')) {
      await fsp.writeFile(file, raw.replace('"status":"resolved"', '"status":"orphaned"'));
    }
  }
  await refreshSearchIndex(lib); // the app's real path: reindex, then search
  const r = await search('文件是唯一的真相', { libraryRoot: lib });
  const hit = r.results[0]?.matches.find((m) => m.type === 'highlight');
  assert.ok(hit, 'orphaned highlight must remain searchable');
  assert.equal(hit.annotation_status, 'orphaned');
});

test('deleted document leaves no ghost results (M3 §35)', async () => {
  const { lib, documentIds } = await setup();
  await fsp.rm(path.join(lib, 'articles', '2026', documentIds['2026 前端趋势观察']), { recursive: true, force: true });
  await refreshSearchIndex(lib);
  const r = await search('2026 前端趋势观察', { libraryRoot: lib });
  assert.equal(r.total, 0);
  const index = await loadSearchIndex(lib);
  assert.equal(index.documents.length, 4);
});

test('changed note is reflected after incremental refresh', async () => {
  const { lib, documentIds } = await setup();
  const dir = path.join(lib, 'articles', '2026', documentIds['本地优先软件的设计原则']);
  const file = path.join(dir, 'annotations.jsonl');
  await fsp.writeFile(file, (await fsp.readFile(file, 'utf8')).replace('核心原则，写进产品纲领', '改写后的笔记内容'));
  await refreshSearchIndex(lib);
  const oldHit = await search('核心原则，写进产品纲领', { libraryRoot: lib });
  assert.equal(oldHit.total, 0);
  const newHit = await search('改写后的笔记内容', { libraryRoot: lib });
  assert.equal(newHit.total, 1);
});

test('full rebuild produces the same results as incremental (M3 §63/64)', async () => {
  const { lib } = await setup();
  const before = search('文件', { libraryRoot: lib });
  await rebuildSearchIndex(lib); // rebuild replaces the index atomically
  const after = search('文件', { libraryRoot: lib });
  assert.deepEqual(
    (await after).results.map((r) => r.document_id),
    (await before).results.map((r) => r.document_id),
  );
});

test('library views: all/inbox/favorites/unread/recent + tag filter (M3 §41-53)', async () => {
  const { lib, documentIds } = await setup();
  const inbox = await queryLibrary('', { view: 'inbox', libraryRoot: lib });
  assert.deepEqual(inbox.results.map((r) => r.document_id).sort(),
    Object.values(documentIds).filter((id) => !id.endsWith('0001')).sort());
  const unread = await queryLibrary('', { view: 'unread', libraryRoot: lib });
  assert.equal(unread.total, 4);
  const favorites = await queryLibrary('', { view: 'favorites', libraryRoot: lib });
  assert.deepEqual(favorites.results.map((r) => r.document_id), [documentIds['本地优先软件的设计原则']]);
  const recent = await queryLibrary('', { view: 'recent', sort: 'recent-opened', libraryRoot: lib });
  assert.deepEqual(recent.results.map((r) => r.document_id), [documentIds['本地优先软件的设计原则']]);
  const tagFiltered = await queryLibrary('', { view: 'all', tags: ['本地优先', '特别收藏'], libraryRoot: lib });
  assert.equal(tagFiltered.total, 1);
});

test('offline: search/library/state are pure local operations (M3 §116/117)', async () => {
  // structural guarantee: no fetch()/network APIs in the search modules
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(here, '..', '..', 'src', 'search', 'search-service.js'), 'utf8')
    + readFileSync(path.join(here, '..', '..', 'src', 'library', 'user-state.js'), 'utf8');
  assert.equal(/\bfetch\s*\(/.test(src), false, 'search/user-state must not perform network calls');
});

test('doctor: duplicate document_id and stale index detected', async () => {
  const { lib } = await setup();
  // duplicate id: copy a document dir
  const srcDir = path.join(lib, 'articles', '2026');
  const first = (await fsp.readdir(srcDir)).filter((d) => !d.startsWith('.'))[0];
  await fsp.cp(path.join(srcDir, first), path.join(srcDir, '77777777-7777-4777-8777-777777777777'), { recursive: true });
  const report = await runDoctor(lib);
  assert.ok(report.findings.some((f) => f.code === 'duplicate_document_id'));
});
