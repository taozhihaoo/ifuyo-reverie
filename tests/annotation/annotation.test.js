import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnnotation, validateAnnotation, serializeAnnotation, parseAnnotationLine } from '../../src/annotation/annotation.js';
import { readAnnotationsFile, appendAnnotation } from '../../src/annotation/store.js';
import { newId } from '../../src/core/ids.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-ann-'));

const sample = (over = {}) => createAnnotation({
  documentId: newId(),
  type: 'highlight',
  locator: { kind: 'text-quote', position: { start: 120, end: 134 } },
  quote: '文件是唯一的真相',
  prefix: '在设计 Reverie 时，我们认为 ',
  suffix: '，数据库只是索引。',
  note: '核心原则',
  tags: ['principle'],
  ...over,
});

test('create -> validate ok, serialize -> parse round-trips exactly', () => {
  const a = sample();
  assert.equal(validateAnnotation(a).ok, true);
  const back = parseAnnotationLine(serializeAnnotation(a));
  assert.deepEqual(back, a);
});

test('store round-trip: append -> read file -> identical objects', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const list = [sample(), sample({ type: 'note', note: '独立笔记', quote: undefined })];
  for (const a of list) await appendAnnotation(file, a);
  const { annotations, invalid } = await readAnnotationsFile(file);
  assert.deepEqual(annotations, list);
  assert.equal(invalid.length, 0);
});

test('corrupt lines are skipped and reported, valid lines survive', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const good = sample();
  await fsp.writeFile(file, [
    serializeAnnotation(good),
    '{ this is not json',
    JSON.stringify({ format_version: 1, annotation_id: 'bad' }),
    serializeAnnotation(sample({ type: 'bookmark' })),
    '',
  ].join('\n'));
  const { annotations, invalid } = await readAnnotationsFile(file);
  assert.equal(annotations.length, 2);
  assert.equal(annotations[0].annotation_id, good.annotation_id);
  assert.equal(invalid.length, 2);
  assert.deepEqual(invalid.map((e) => e.line), [2, 3]);
});

test('appendAnnotation fails closed on invalid annotation (nothing written)', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const bad = sample();
  bad.status = 'nonsense';
  await assert.rejects(() => appendAnnotation(file, bad), /status/);
  await assert.rejects(() => fsp.access(file)); // file not created
});

test('missing annotations file reads as empty', async () => {
  const dir = await tmpdir();
  const { annotations, invalid } = await readAnnotationsFile(path.join(dir, 'nope.jsonl'));
  assert.deepEqual(annotations, []);
  assert.deepEqual(invalid, []);
});

test('orphaned status round-trips (never silently dropped)', async () => {
  const a = sample();
  a.status = 'orphaned';
  assert.equal(validateAnnotation(a).ok, true);
  assert.equal(parseAnnotationLine(serializeAnnotation(a)).status, 'orphaned');
});
