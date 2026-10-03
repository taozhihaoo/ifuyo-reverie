import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic, appendLine, sweepTmpFiles } from '../../src/core/atomic-write.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-aw-'));

test('writeFileAtomic creates a file with exact content and leaves no tmp files', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'meta.json');
  await writeFileAtomic(file, '{"a":1}');
  assert.equal(await fsp.readFile(file, 'utf8'), '{"a":1}');
  assert.deepEqual(await fsp.readdir(dir), ['meta.json']);
});

test('writeFileAtomic replaces existing content (no half file possible)', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'meta.json');
  await writeFileAtomic(file, 'old-old-old');
  await writeFileAtomic(file, 'new');
  assert.equal(await fsp.readFile(file, 'utf8'), 'new');
  assert.deepEqual(await fsp.readdir(dir), ['meta.json']);
});

test('appendLine appends newline-terminated lines', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  await appendLine(file, '{"n":1}');
  await appendLine(file, '{"n":2}');
  const lines = (await fsp.readFile(file, 'utf8')).split('\n').filter(Boolean);
  assert.deepEqual(lines, ['{"n":1}', '{"n":2}']);
});

test('sweepTmpFiles removes crash leftovers only', async () => {
  const dir = await tmpdir();
  await fsp.writeFile(path.join(dir, 'meta.json.tmp-abc123'), 'junk');
  await fsp.writeFile(path.join(dir, 'meta.json'), 'good');
  assert.equal(await sweepTmpFiles(dir), 1);
  assert.deepEqual(await fsp.readdir(dir), ['meta.json']);
});
