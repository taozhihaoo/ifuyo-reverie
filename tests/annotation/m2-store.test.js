import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAnnotationsFile, appendAnnotation, rewriteAnnotations, updateAnnotation, removeAnnotation } from '../../src/annotation/store.js';
import { createAnnotation } from '../../src/annotation/annotation.js';
import { newId } from '../../src/core/ids.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m2store-'));
const docId = () => newId();

const highlight = (over = {}) => createAnnotation({
  documentId: over.documentId ?? docId(),
  type: 'highlight',
  locator: { kind: 'text-quote', position: { start: 10, end: 20 } },
  quote: '被选中的原文',
  prefix: '前文上下文',
  suffix: '后文上下文',
  ...over,
});

test('duplicate annotation_id lines are detected, first kept, rest diagnosed', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const a = highlight();
  const b = highlight();
  const dup = { ...a }; // same id, different content
  dup.note = 'mutated duplicate';
  await fsp.writeFile(file, [
    JSON.stringify(a),
    JSON.stringify(b),
    JSON.stringify(dup),
  ].join('\n') + '\n');
  const { annotations, duplicates } = await readAnnotationsFile(file);
  assert.equal(annotations.length, 2);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].annotation_id, a.annotation_id);
  assert.equal(duplicates[0].line, 3);
});

test('document_id mismatch is a per-line diagnostic when expected id is given', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const mine = highlight({ documentId: docId() });
  const theirs = highlight({ documentId: docId() });
  await fsp.writeFile(file, [JSON.stringify(mine), JSON.stringify(theirs)].join('\n') + '\n');
  const ok = await readAnnotationsFile(file, { documentId: mine.document_id });
  assert.equal(ok.annotations.length, 1);
  assert.equal(ok.invalid.length, 1);
  assert.match(ok.invalid[0].reason, /document_id mismatch/);
  // without expectation both load (scanner path)
  const all = await readAnnotationsFile(file);
  assert.equal(all.annotations.length, 2);
});

test('updateAnnotation patches fields, keeps id, bumps updated_at, rewrites atomically', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const a = highlight();
  const b = highlight();
  await appendAnnotation(file, a);
  await appendAnnotation(file, b);
  const next = await updateAnnotation(file, a.annotation_id, { note: '新的笔记' }, { now: '2026-10-05T00:00:00.000Z' });
  assert.equal(next.annotation_id, a.annotation_id);
  assert.equal(next.note, '新的笔记');
  assert.equal(next.updated_at, '2026-10-05T00:00:00.000Z');
  const { annotations } = await readAnnotationsFile(file);
  assert.equal(annotations.length, 2);
  assert.equal(annotations[0].note, '新的笔记');
  assert.equal(annotations[1].annotation_id, b.annotation_id);
});

test('removeAnnotation deletes exactly one, atomic file rewrite', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const ids = [highlight(), highlight(), highlight()].map((a) => a.annotation_id);
  for (const id of ids) {
    const a = highlight();
    a.annotation_id = id;
    await appendAnnotation(file, a);
  }
  await removeAnnotation(file, ids[1]);
  const { annotations } = await readAnnotationsFile(file);
  assert.deepEqual(annotations.map((a) => a.annotation_id), [ids[0], ids[2]]);
  // file has no torn content
  const raw = await fsp.readFile(file, 'utf8');
  assert.equal(raw.trim().split('\n').length, 2);
});

test('rewrite to empty yields an empty file (all annotations removed)', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  await appendAnnotation(file, highlight());
  await rewriteAnnotations(file, []);
  const raw = await fsp.readFile(file, 'utf8');
  assert.equal(raw, '');
  const { annotations } = await readAnnotationsFile(file);
  assert.equal(annotations.length, 0);
});

test('update/remove on missing id fails without touching the file', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const a = highlight();
  await appendAnnotation(file, a);
  const before = await fsp.readFile(file, 'utf8');
  await assert.rejects(() => updateAnnotation(file, newId(), { note: 'x' }), /not found/);
  await assert.rejects(() => removeAnnotation(file, newId()), /not found/);
  assert.equal(await fsp.readFile(file, 'utf8'), before);
});
