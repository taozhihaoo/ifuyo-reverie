import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMeta, writeMeta, validateMeta, MetaVersionError, FORMAT_VERSION } from '../../src/core/meta.js';
import { newId } from '../../src/core/ids.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-meta-'));

const validMeta = (over = {}) => ({
  format_version: FORMAT_VERSION,
  document_id: newId(),
  type: 'article',
  title: '示例文章标题',
  created_at: '2026-10-04T08:00:00.000Z',
  updated_at: '2026-10-04T08:00:00.000Z',
  ...over,
});

test('meta round-trip: write -> read preserves semantics exactly', async () => {
  const dir = await tmpdir();
  const meta = validMeta({
    author: '某作者',
    source: {
      original_url: 'https://example.com/a?utm=x',
      canonical_url: 'https://example.com/a',
      capture_time: '2026-10-04T08:00:00.000Z',
      extractor: { name: 'readability', version: '0.6.0' },
      content_hash: 'sha256-' + 'ab'.repeat(32),
    },
  });
  await writeMeta(dir, meta);
  const back = await readMeta(dir);
  assert.deepEqual(back, meta);
});

test('meta preserves unknown fields (forward compatibility)', async () => {
  const dir = await tmpdir();
  const meta = validMeta({ some_future_field: { nested: [1, 2] } });
  await writeMeta(dir, meta);
  const back = await readMeta(dir);
  assert.deepEqual(back.some_future_field, { nested: [1, 2] });
});

test('writeMeta refuses invalid meta (missing title)', async () => {
  const dir = await tmpdir();
  const meta = validMeta();
  delete meta.title;
  await assert.rejects(() => writeMeta(dir, meta), /title/);
});

test('readMeta rejects a newer format_version with MetaVersionError', async () => {
  const dir = await tmpdir();
  const future = validMeta({ format_version: FORMAT_VERSION + 1 });
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(future));
  await assert.rejects(() => readMeta(dir), (err) => err instanceof MetaVersionError);
});

test('readMeta rejects unparsable JSON', async () => {
  const dir = await tmpdir();
  await fsp.writeFile(path.join(dir, 'meta.json'), '{oops');
  await assert.rejects(() => readMeta(dir), /not valid JSON/);
});

test('validateMeta reports all problems, does not throw', () => {
  const { ok, errors } = validateMeta({ format_version: 99 });
  assert.equal(ok, false);
  assert.ok(errors.length >= 4);
});

test('newId produces lowercase UUID v4', () => {
  for (let i = 0; i < 20; i++) assert.match(newId(), /^[0-9a-f-]{36}$/);
});
