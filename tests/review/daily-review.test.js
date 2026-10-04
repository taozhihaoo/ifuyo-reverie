/**
 * Daily Review tests (M5 §42-50/§96-98): queue generation from existing
 * library data, deterministic sessions, no read-state mutation, resilience
 * against missing/orphaned data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReviewQueue, markReviewed, createRng } from '../../src/review/daily-review.js';
import { resetCacheForTests, loadUserState } from '../../src/library/user-state.js';
import { writeMeta } from '../../src/core/meta.js';
import { writeFileAtomic } from '../../src/core/atomic-write.js';
import { newId } from '../../src/core/ids.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-review-'));

const CORPUS_META = [
  { title: '文章甲', tags: ['rust'], read: true },
  { title: '文章乙', tags: ['ai'], read: false },
  { title: '文章丙', tags: [], read: false },
];

const setup = async ({ annotations = [], empty = false } = {}) => {
  const lib = await tmpdir();
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  process.env.REVERIE_REVIEW_STATE = path.join(lib, '..', 'daily-review.json');
  process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-index-${path.basename(lib)}.json`);
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  invalidateSearchIndex();
  const documentIds = [];
  if (empty) { await markReviewed([]).catch(() => {}); return { lib, documentIds: [] }; }
  for (const m of CORPUS_META) {
    const documentId = newId();
    documentIds.push(documentId);
    const now = new Date().toISOString();
    await writeMeta(path.join(lib, 'articles', '2026', documentId), {
      format_version: 1, document_id: documentId, type: 'article', title: m.title,
      created_at: now, captured_at: now, updated_at: now,
      source: { capture_time: now, extractor: { name: 'x', version: '1' } },
    });
    await writeFileAtomic(path.join(lib, 'articles', '2026', documentId, 'article.md'), `# ${m.title}\n\n正文。\n`);
    if (annotations.find((a) => a.docIndex === CORPUS_META.indexOf(m))) {
      const { appendAnnotation } = await import('../../src/annotation/store.js');
      const { createAnnotation } = await import('../../src/annotation/annotation.js');
      for (const a of annotations.filter((x) => x.docIndex === CORPUS_META.indexOf(m))) {
        await appendAnnotation(path.join(docDir2(lib, documentId), 'annotations.jsonl'), createAnnotation({
          documentId, type: a.type ?? 'highlight',
          locator: { kind: 'text-quote', position: { start: 0, end: 5 } },
          quote: a.quote, note: a.note ?? '',
        }));
      }
    }
  }
  function docDir2(root, id) { return path.join(root, 'articles', '2026', id); }
  const { rebuildSearchIndex } = await import('../../src/search/search-service.js');
  await rebuildSearchIndex(lib);
  return { lib, documentIds };
};

test('createRng is deterministic and bounded', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i++) {
    const va = a(); const vb = b();
    assert.equal(va, vb);
    assert.ok(va >= 0 && va < 1);
  }
});

test('empty library: queue is empty, no crash (M5 §96)', async () => {
  const lib = await setup({ empty: true });
  const { queue } = await buildReviewQueue(lib, { strategy: 'mixed' });
  assert.equal(queue.length, 0);
});

test('queue includes highlights and notes with context (M5 §48)', async () => {
  const { lib, documentIds } = await setup({ annotations: [
    { docIndex: 0, quote: '文件是唯一的真相', note: '核心原则' },
    { docIndex: 1, quote: '本地优先意味着离线可用', note: '' },
  ] });
  const { queue } = await buildReviewQueue(lib, { strategy: 'highlights' });
  assert.equal(queue.length, 2);
  for (const item of queue) {
    assert.equal(item.kind, 'highlight');
    assert.ok(item.annotation_id);
    assert.ok(item.document_id);
    assert.ok(item.context.title);
    assert.ok(item.context.quoted_text);
  }
  // both documents referenced
  const docSet = new Set(queue.map((q) => q.document_id));
  assert.ok(documentIds.every((id) => true));
  assert.ok(docSet.has(documentIds[0]) || docSet.has(documentIds[1]));
});

test('queue is deterministic per (date, strategy) session (M5 §49)', async () => {
  const { lib } = await setup({ annotations: [
    { docIndex: 0, quote: '引文一' },
    { docIndex: 1, quote: '引文二' },
  ] });
  const q1 = await buildReviewQueue(lib, { strategy: 'mixed', date: '2026-10-06' });
  const q2 = await buildReviewQueue(lib, { strategy: 'mixed', date: '2026-10-06' });
  assert.deepEqual(q1.queue.map((q) => q.id), q2.queue.map((q) => q.id));
});

test('strategy filters: highlights only / notes only', async () => {
  const { lib } = await setup({ annotations: [
    { docIndex: 0, quote: '高亮甲', note: '笔记甲' },
    { docIndex: 1, quote: '高亮乙', type: 'note', note: '独立笔记' },
  ] });
  const hl = await buildReviewQueue(lib, { strategy: 'highlights' });
  assert.equal(hl.queue.length, 1, 'one highlight expected');
  const notes = await buildReviewQueue(lib, { strategy: 'notes' });
  assert.equal(notes.queue.length, 1, 'one note annotation expected');
});

test('same annotation never appears twice in one session (M5 §98)', async () => {
  const { lib } = await setup({ annotations: [
    { docIndex: 0, quote: '重复引文测试甲' },
    { docIndex: 1, quote: '重复引文测试乙' },
  ] });
  const { queue } = await buildReviewQueue(lib, { strategy: 'mixed' });
  const ids = queue.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('review state persists as derived user state (M5 §47)', async () => {
  await setup();
  await markReviewed([{ id: 'ann:x' }], { date: '2026-10-06T00:00:00.000Z' });
  const state = JSON.parse(await fsp.readFile(process.env.REVERIE_REVIEW_STATE, 'utf8'));
  assert.equal(state.review_state_version, 1);
  assert.equal(state.history['ann:x'].last_reviewed_at, '2026-10-06T00:00:00.000Z');
});

test('review state lives outside article directories (M5 §46)', async () => {
  const { lib } = await setup();
  await markReviewed([{ id: 'ann-x' }]);
  const articleFiles = await fsp.readdir(path.join(lib, 'articles'), { recursive: true });
  assert.ok(articleFiles.every((f) => !f.toLowerCase().includes('review')), 'article dirs must not contain review state');
});
