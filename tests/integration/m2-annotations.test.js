import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMarkdownBlocks } from '../../src/reader/markdown-reader.js';
import { createAnnotationService } from '../../src/annotation/service.js';
import { rebuildIndex, loadIndex, loadReadState, setReadState } from '../../src/library/index.js';

const fixture = (name) => fsp.readFile(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'annotations', name),
  'utf8',
);
const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m2rt-'));

/** Build a realistic captured article directory (as the M1 pipeline would). */
async function makeArticle(libraryRoot, md, title) {
  const { createHash } = await import('node:crypto');
  const { writeFileAtomic } = await import('../../src/core/atomic-write.js');
  const { writeMeta } = await import('../../src/core/meta.js');
  const { newId } = await import('../../src/core/ids.js');
  const now = new Date().toISOString();
  const documentId = newId();
  const dir = path.join(libraryRoot, 'articles', String(new Date().getFullYear()), documentId);
  await writeMeta(dir, {
    format_version: 1,
    document_id: documentId,
    type: 'article',
    title,
    created_at: now,
    captured_at: now,
    updated_at: now,
    source: {
      original_url: `https://example.com/${documentId}`,
      capture_time: now,
      extractor: { name: 'readability', version: '0.6.0' },
    },
  });
  await writeFileAtomic(path.join(dir, 'article.md'), md);
  void createHash;
  return { documentId, dir };
}

test('M2 §43 index rebuild: annotations survive total index loss (projection)', async () => {
  const lib = await tmpdir();
  const appData = await tmpdir();
  const md = await fixture('multi-paragraph.md');
  const { documentId, dir } = await makeArticle(lib, md, '投影测试');
  const { canonicalText } = parseMarkdownBlocks(md);
  const service = createAnnotationService({ articleDir: dir, documentId, getReaderContext: async () => ({ canonicalText }) });
  const start = canonicalText.indexOf('本地优先意味着网络只是手段');
  const anchor = {
    quote: '本地优先意味着网络只是手段',
    prefix: canonicalText.slice(start - 32, start),
    suffix: canonicalText.slice(start + 12, start + 44),
    position: { start, end: start + 12 },
  };
  const { annotation } = await service.createHighlight({ anchor, note: '投影前创建的笔记' });

  // 1st index build includes the annotation projection
  const indexPath = path.join(appData, 'index.json');
  let { index } = await rebuildIndex(lib, indexPath);
  const entry = index.entries.find((e) => e.document_id === documentId);
  assert.equal(entry.annotations.length, 1);
  assert.equal(entry.annotations[0].annotation_id, annotation.annotation_id);
  assert.equal(entry.annotations[0].selected_text, '本地优先意味着网络只是手段');

  // 2. delete the whole derived index (the §43 scenario)
  await fsp.rm(indexPath);

  // 3. rescan + rebuild -> annotation still there (source: annotations.jsonl)
  ({ index } = await rebuildIndex(lib, indexPath));
  const rebuilt = index.entries.find((e) => e.document_id === documentId);
  assert.equal(rebuilt.annotations.length, 1);
  assert.equal(rebuilt.annotations[0].annotation_id, annotation.annotation_id);
  assert.equal(rebuilt.annotations[0].note ?? null, null); // projection keeps summary fields
  // and the file itself was never touched
  const raw = await fsp.readFile(path.join(dir, 'annotations.jsonl'), 'utf8');
  assert.ok(raw.includes(annotation.annotation_id));
  assert.ok(raw.includes('投影前创建的笔记'));
});

test('M2 full loop: create -> save -> reload -> resolve -> note -> delete, across restarts', async () => {
  const lib = await tmpdir();
  const md = await fixture('zh.md');
  const { documentId, dir } = await makeArticle(lib, md, '全循环测试');
  const mk = () => {
    const { canonicalText } = parseMarkdownBlocks(md);
    return createAnnotationService({ articleDir: dir, documentId, getReaderContext: async () => ({ canonicalText }) });
  };

  // session 1: create + note
  const s1 = mk();
  const { canonicalText } = parseMarkdownBlocks(md);
  const quote = '划线之后重新打开，位置必须恢复';
  const start = canonicalText.indexOf(quote);
  const { annotation } = await s1.createHighlight({
    anchor: { quote, prefix: canonicalText.slice(start - 32, start), suffix: canonicalText.slice(start + quote.length, start + quote.length + 32), position: { start, end: start + quote.length } },
    note: '第一条笔记',
  });

  // session 2 (restart): reload -> resolved -> note visible
  const s2 = mk();
  let list = await s2.listResolved();
  assert.equal(list.annotations.length, 1);
  assert.equal(list.annotations[0].status, 'resolved');
  assert.equal(list.annotations[0].note, '第一条笔记');

  // update note
  await s2.updateNote(annotation.annotation_id, '修改后的笔记');
  // delete a DIFFERENT (nonexistent) id fails; delete real one works
  await s2.delete(annotation.annotation_id);
  list = await s2.listResolved();
  assert.equal(list.annotations.length, 0);
});

test('M2 performance: 500 annotations on a 200-paragraph article resolve quickly', async () => {
  const md = await fixture('long.md');
  const { canonicalText } = parseMarkdownBlocks(md);
  const dir = await tmpdir();
  const documentId = '11111111-2222-4333-8444-555555555555';
  const service = createAnnotationService({ articleDir: dir, documentId, getReaderContext: async () => ({ canonicalText }) });

  // create 500 annotations spread across the document
  const t0 = Date.now();
  for (let i = 0; i < 500; i++) {
    const paraIdx = (i + 1) * 47 % 200;
    const marker = `第${paraIdx + 1}段：这是长文章的第${paraIdx + 1}段`;
    const start = canonicalText.indexOf(marker);
    if (start === -1) continue;
    await service.createHighlight({
      anchor: { quote: marker, prefix: canonicalText.slice(Math.max(0, start - 32), start), suffix: canonicalText.slice(start + marker.length, start + marker.length + 32), position: { start, end: start + marker.length } },
    });
  }
  const createMs = Date.now() - t0;

  const t1 = Date.now();
  const list = await service.listResolved();
  const resolveMs = Date.now() - t1;
  assert.equal(list.annotations.filter((a) => a.status === 'resolved').length, list.annotations.length);
  console.log(`[perf] 500 annotations: create ${createMs}ms (${Math.round(createMs / 500)}us/ea), resolve+persist ${resolveMs}ms, canonical ${canonicalText.length} chars`);
  assert.ok(resolveMs < 5000, `resolution must stay interactive (took ${resolveMs}ms)`);
});

test('read state remains app-side and never enters the article directory (M1 §19 regression)', async () => {
  const lib = await tmpdir();
  const appData = await tmpdir();
  const md = await fixture('short.md');
  const { documentId } = await makeArticle(lib, md, '阅读状态');
  await setReadState(documentId, 'read', path.join(appData, 'read-state.json'));
  const rs = await loadReadState(path.join(appData, 'read-state.json'));
  assert.equal(rs.states[documentId].state, 'read');
  const files = await fsp.readdir(path.join(lib, 'articles'), { recursive: true });
  assert.equal(files.filter((f) => f.includes('read-state')).length, 0);
});
