import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery } from '../../src/search/query-parser.js';

test('plain terms parse with AND semantics', () => {
  const q = parseSearchQuery('rust ai 2026');
  assert.deepEqual(q.terms, ['rust', 'ai', '2026']);
  assert.equal(q.error, null);
});

test('quoted phrase is preserved as one term', () => {
  const q = parseSearchQuery('"local first" rust');
  assert.deepEqual(q.phrases, ['local first']);
  assert.deepEqual(q.terms, ['rust']);
});

test('filters: tag / is:read / is:unread / is:favorite / is:inbox / author', () => {
  assert.deepEqual(parseSearchQuery('tag:rust').tags, ['rust']);
  assert.equal(parseSearchQuery('tag:rust').read, null);
  assert.equal(parseSearchQuery('is:read').read, true);
  assert.equal(parseSearchQuery('is:unread').read, false);
  assert.equal(parseSearchQuery('is:favorite').favorite, true);
  assert.equal(parseSearchQuery('is:inbox').inbox, true);
  assert.equal(parseSearchQuery('author:gray').author, 'gray');
  // unknown prefix is treated as a plain term (documented behaviour, M3 §27 keeps it non-fatal)
  assert.deepEqual(parseSearchQuery('foo:bar').terms, ['foo:bar']);
});

test('combined query: AI tag:rust is:unread', () => {
  const q = parseSearchQuery('AI tag:rust is:unread');
  assert.deepEqual(q.terms, ['AI']);
  assert.deepEqual(q.tags, ['rust']);
  assert.equal(q.read, false);
  assert.equal(q.error, null);
});

test('multiple tag filters AND together (M3 §51)', () => {
  const q = parseSearchQuery('tag:rust tag:ai');
  assert.deepEqual(q.tags, ['rust', 'ai']);
});

test('friendly errors instead of crashes (M3 §27)', () => {
  assert.match(parseSearchQuery('tag:').error, /缺少内容/);
  assert.equal(parseSearchQuery('tag:rust').error, null);
  assert.match(parseSearchQuery('"unclosed').error, /引号不闭合/);
  assert.match(parseSearchQuery('is:unknown').error, /未知的过滤条件/);
  // results carry the error, never an exception — handled above by API contract
});

test('empty query is valid (view-only browsing)', () => {
  const q = parseSearchQuery('   ');
  assert.equal(q.error, null);
  assert.deepEqual(q.terms, []);
});
