import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseMarkdownBlocks } from '../../src/reader/markdown-reader.js';
import { createAnnotationService, resolveAnnotation } from '../../src/annotation/service.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m2svc-'));

const ARTICLE = `# 服务层测试

第一段：标注服务必须把业务逻辑与持久化分开，UI 永远不直接操作文件。

第二段：重复短语测试。关键词是唯一的，这句话用于定位验证。

第三段：收尾段落，提供后文上下文。
`;

const setup = async () => {
  const dir = await tmpdir();
  const documentId = '11111111-2222-4333-8444-555555555555';
  const { canonicalText } = parseMarkdownBlocks(ARTICLE);
  const service = createAnnotationService({
    articleDir: dir,
    documentId,
    getReaderContext: async () => ({ canonicalText }),
  });
  return { dir, documentId, canonicalText, service };
};

const anchorFor = (canonicalText, quote) => {
  const start = canonicalText.indexOf(quote);
  assert.ok(start !== -1);
  return {
    quote,
    prefix: canonicalText.slice(Math.max(0, start - 32), start),
    suffix: canonicalText.slice(start + quote.length, start + quote.length + 32),
    position: { start, end: start + quote.length },
  };
};

test('createHighlight persists and resolves; create-time validation rejects unfindable anchors', async () => {
  const { canonicalText, service } = await setup();
  const anchor = anchorFor(canonicalText, '关键词是唯一的');
  const { annotation, resolution } = await service.createHighlight({ anchor });
  assert.equal(annotation.type, 'highlight');
  assert.equal(annotation.status, 'resolved');
  assert.equal(annotation.source_content_hash.startsWith('sha256-'), true);
  assert.ok(resolution.start >= 0);
  // persisted
  const raw = await fsp.readFile(path.join(process.cwd(), 'package.json'), 'utf8'); // touch fs sanity
  void raw;
  const list = await service.listResolved();
  assert.equal(list.annotations.length, 1);
  assert.equal(list.annotations[0].annotation_id, annotation.annotation_id);

  // anchor that cannot resolve must be rejected BEFORE persisting
  await assert.rejects(() => service.createHighlight({ anchor: { quote: '不存在的引文', prefix: '', suffix: '' } }), /does not resolve/);
  const still = await service.listResolved();
  assert.equal(still.annotations.length, 1, 'rejected create must not leave a file behind');
});

test('updateNote edits the note on the same annotation id', async () => {
  const { canonicalText, service } = await setup();
  const anchor = anchorFor(canonicalText, '关键词是唯一的');
  const { annotation } = await service.createHighlight({ anchor, note: '初版笔记' });
  const updated = await service.updateNote(annotation.annotation_id, '修改后的笔记');
  assert.equal(updated.note, '修改后的笔记');
  assert.equal(updated.annotation_id, annotation.annotation_id);
});

test('delete removes the annotation (file rewrite)', async () => {
  const { canonicalText, service } = await setup();
  const { annotation } = await service.createHighlight({ anchor: anchorFor(canonicalText, '关键词是唯一的') });
  await service.delete(annotation.annotation_id);
  const list = await service.listResolved();
  assert.equal(list.annotations.length, 0);
});

test('listResolved: hash fast path, content change re-resolve, orphan never deleted', async () => {
  const { dir, canonicalText, service } = await setup();
  const { annotation } = await service.createHighlight({ anchor: anchorFor(canonicalText, '关键词是唯一的') });

  // 1st resolution: hash fast path
  let list = await service.listResolved();
  assert.equal(list.annotations[0].status, 'resolved');
  assert.equal(list.annotations[0].resolution.quality, 'hash-position');

  // content changes -> hash differs -> full resolver -> position refreshed
  const changed = canonicalText.replace('第一段：', '第一段之前多了一句全新的话。第一段：');
  const service2 = createAnnotationService({
    articleDir: dir,
    documentId: '11111111-2222-4333-8444-555555555555',
    getReaderContext: async () => ({ canonicalText: changed }),
  });
  list = await service2.listResolved();
  assert.equal(list.annotations[0].status, 'resolved');
  assert.notEqual(list.annotations[0].locator.position.start, annotation.locator.position.start);
  assert.equal(changed.slice(list.annotations[0].locator.position.start, list.annotations[0].locator.position.end), '关键词是唯一的');

  // quote destroyed -> orphaned, annotation kept on disk
  const destroyed = canonicalText.replace('第二段：重复短语测试。关键词是唯一的，这句话用于定位验证。', '第二段：彻底重写了。');
  const service3 = createAnnotationService({
    articleDir: dir,
    documentId: '11111111-2222-4333-8444-555555555555',
    getReaderContext: async () => ({ canonicalText: destroyed }),
  });
  list = await service3.listResolved();
  assert.equal(list.annotations[0].status, 'orphaned');
  assert.equal(list.annotations[0].quoted_text, '关键词是唯一的', 'orphaned annotation must keep its quote');
  const raw = await fsp.readFile(path.join(dir, 'annotations.jsonl'), 'utf8');
  assert.ok(raw.includes('关键词是唯一的'), 'orphaned annotation must be persisted, never silently deleted');
});

test('repair replaces the anchor and KEEPS the annotation_id (M2 §32)', async () => {
  const { dir, canonicalText, service } = await setup();
  const { annotation } = await service.createHighlight({ anchor: anchorFor(canonicalText, '关键词是唯一的') });

  // document changes such that the original quote is gone
  const destroyed = canonicalText.replace('关键词是唯一的', '关键词已经被替换掉了');
  const service2 = createAnnotationService({
    articleDir: dir,
    documentId: '11111111-2222-4333-8444-555555555555',
    getReaderContext: async () => ({ canonicalText: destroyed }),
  });
  let list = await service2.listResolved();
  assert.equal(list.annotations[0].status, 'orphaned');

  // user selects the new text -> repair with the same id
  const newAnchor = anchorFor(destroyed, '关键词已经被替换掉了');
  const { annotation: repaired } = await service2.repair(annotation.annotation_id, { anchor: newAnchor });
  assert.equal(repaired.annotation_id, annotation.annotation_id, 'repair must keep the stable id');
  assert.equal(repaired.status, 'resolved');

  list = await service2.listResolved();
  assert.equal(list.annotations[0].status, 'resolved');
  assert.equal(list.annotations[0].annotation_id, annotation.annotation_id);
});

test('resolveAnnotation distinguishes resolved / orphaned and never fabricates', async () => {
  const { canonicalText } = await setup();
  const good = { quoted_text: '关键词是唯一的', prefix: '', suffix: '', locator: { kind: 'text-quote', position: { start: 0, end: 7 } } };
  assert.equal(resolveAnnotation(good, canonicalText).status, 'resolved');
  const gone = { quoted_text: '根本不存在的话', prefix: '', suffix: '', locator: { kind: 'text-quote', position: { start: 0, end: 7 } } };
  assert.equal(resolveAnnotation(gone, canonicalText).status, 'orphaned');
});
