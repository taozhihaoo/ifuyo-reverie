import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createAnchorFromRange, resolveAnchorInDom } from '../../src/annotation/anchor.js';
import { appendAnnotation } from '../../src/annotation/store.js';
import { readAnnotationsFile } from '../../src/annotation/store.js';
import { openEpub } from '../../spikes/epub/lib.mjs';
import { getPdfjs } from '../../spikes/pdf/lib.mjs';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-int-'));

const ARTICLE = `<article id="art">
<p>文件是真相，数据库只是索引。</p>
<p>标注必须能在重启之后回到原来的位置，找不到时必须保留。</p>
</article>`;

test('web document full cycle: highlight -> persist to file -> simulated restart -> restore', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const doc = new JSDOM(ARTICLE).window.document;
  const root = doc.getElementById('art');

  // 1. user selects text, anchor + annotation created
  const p1 = root.querySelectorAll('p')[0].firstChild;
  const range = doc.createRange();
  range.setStart(p1, 6);
  range.setEnd(p1, 9);
  const anchor = createAnchorFromRange(range, root);
  const annotation = {
    format_version: 1,
    annotation_id: crypto.randomUUID(),
    document_id: crypto.randomUUID(),
    type: 'highlight',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    quoted_text: anchor.quote,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    locator: anchor,
    note: '',
    tags: [],
    status: 'resolved',
  };
  await appendAnnotation(file, annotation);

  // 2. app restarts: fresh read from disk, fresh DOM (same content)
  const { annotations } = await readAnnotationsFile(file);
  assert.equal(annotations.length, 1);
  const restoredAnnotation = annotations[0];
  const freshDoc = new JSDOM(ARTICLE).window.document;
  const freshRoot = freshDoc.getElementById('art');

  // 3. resolve the persisted locator against the fresh DOM
  const result = resolveAnchorInDom(restoredAnnotation.locator, freshRoot);
  assert.equal(result.status, 'resolved');
  assert.equal(result.range.toString(), '数据库'); // the original quote
  assert.equal(result.range.startContainer === freshRoot.querySelectorAll('p')[0].firstChild, true);
});

test('bookmark round-trips through the annotation store', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'annotations.jsonl');
  const base = {
    document_id: crypto.randomUUID(),
    type: 'bookmark',
    locator: { kind: 'text-quote', position: { start: 100, end: 100 } },
  };
  const bookmark = {
    format_version: 1,
    annotation_id: crypto.randomUUID(),
    ...base,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    note: '第五章开头',
    tags: ['important'],
    status: 'resolved',
  };
  await appendAnnotation(file, bookmark);
  const { annotations } = await readAnnotationsFile(file);
  assert.deepEqual(annotations, [bookmark]);
});

test('corrupt EPUB (not a zip) fails cleanly, not with a crash-loop', async () => {
  const dir = await tmpdir();
  const bad = path.join(dir, 'bad.epub');
  await fsp.writeFile(bad, Buffer.from('this is not a zip file at all'));
  await assert.rejects(() => openEpub(bad));
});

test('corrupt PDF fails cleanly via getDocument rejection', async () => {
  const pdfjs = await getPdfjs();
  await assert.rejects(() => pdfjs.getDocument({
    data: new Uint8Array(Buffer.from('%PDF-not-really')),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise);
});
