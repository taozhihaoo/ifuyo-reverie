import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMarkdownBlocks } from '../../src/reader/markdown-reader.js';
import { createAnnotationService } from '../../src/annotation/service.js';
import { updateUserState, loadUserState, stateOf, resetCacheForTests } from '../../src/library/user-state.js';
import { rebuildSearchIndex, refreshSearchIndex, search, queryLibrary } from '../../src/search/search-service.js';
import { writeMeta } from '../../src/core/meta.js';
import { writeFileAtomic } from '../../src/core/atomic-write.js';
import { newId } from '../../src/core/ids.js';
// local test HTTP servers live on loopback — explicit test policy (M4 §57)
process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1';

const here = path.dirname(fileURLToPath(import.meta.url));

/** M3 §97: create -> tag -> highlight -> note -> favorite -> read -> remove inbox -> search. */
test('full consistency flow: every field lands in search and library views', async () => {
  resetCacheForTests();
  const lib = await tmpdir();
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = await fsp.mkdtemp(path.join(lib, '..', 'm3-home-'));

  // create document (as the capture pipeline would)
  const documentId = newId();
  const md = `# 一致性流程测试\n\n正文包含关键词 SQLite，用于全文搜索验证。第二段提供额外上下文。\n`;
  const dir = path.join(lib, 'articles', '2026', documentId);
  const now = new Date().toISOString();
  await writeMeta(dir, {
    format_version: 1, document_id: documentId, type: 'article',
    title: '一致性流程测试文章', author: '测试者',
    created_at: now, captured_at: now, updated_at: now,
    source: { original_url: 'https://example.com/consistency', capture_time: now, extractor: { name: 'readability', version: '0.6.0' } },
  });
  await writeFileAtomic(path.join(dir, 'article.md'), md);

  // tag + favorite + read + remove inbox
  await updateUserState(documentId, { tags: ['Rust'], favorite: true, read: true, inbox: false });

  // highlight + note (M2 service)
  const { canonicalText } = parseMarkdownBlocks(md);
  const service = createAnnotationService({ articleDir: dir, documentId, getReaderContext: async () => ({ canonicalText }) });
  const start = canonicalText.indexOf('SQLite');
  const { annotation } = await service.createHighlight({
    anchor: { quote: 'SQLite', prefix: canonicalText.slice(start - 32, start), suffix: canonicalText.slice(start + 6, start + 38), position: { start, end: start + 6 } },
    note: '这条笔记提到一致性',
  });

  // rebuild derived index, then search every field
  await rebuildSearchIndex(lib);

  const body = await search('关键词 SQLite', { libraryRoot: lib });
  assert.equal(body.total, 1);
  assert.ok(body.results[0].matches.some((m) => m.type === 'body'));

  const highlight = await search('一致性流程测试文章 SQLite', { libraryRoot: lib });
  assert.equal(highlight.total, 1);

  const note = await search('这条笔记提到一致性', { libraryRoot: lib });
  assert.equal(note.total, 1);
  assert.ok(note.results[0].matches.some((m) => m.type === 'note' && m.annotation_id === annotation.annotation_id));

  const tag = await search('tag:Rust', { libraryRoot: lib });
  assert.equal(tag.total, 1);
  assert.equal(tag.results[0].document_id, documentId);

  const title = await search('一致性流程测试文章', { libraryRoot: lib });
  assert.ok(title.results[0].matches.some((m) => m.type === 'title'));

  const author = await search('author:测试者', { libraryRoot: lib });
  assert.equal(author.total, 1);

  const url = await search('example.com/consistency', { libraryRoot: lib });
  assert.equal(url.total, 1);

  // library views reflect the state
  const favorites = await queryLibrary('', { view: 'favorites', libraryRoot: lib });
  assert.deepEqual(favorites.results.map((r) => r.document_id), [documentId]);
  const unread = await queryLibrary('', { view: 'unread', libraryRoot: lib });
  assert.equal(unread.total, 0, 'document was marked read');
  const inbox = await queryLibrary('', { view: 'inbox', libraryRoot: lib });
  assert.equal(inbox.total, 0, 'document was removed from inbox');

  // crash-safety regression: index file torn -> rebuild restores everything
  await fsp.rm(process.env.REVERIE_HOME + path.sep + 'search-index.json');
  await rebuildSearchIndex(lib);
  const after = await search('tag:Rust', { libraryRoot: lib });
  assert.equal(after.total, 1);
});

function tmpdir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-consistency-'));
}
