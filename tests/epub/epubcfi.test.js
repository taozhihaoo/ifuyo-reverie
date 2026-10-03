import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import * as CFI from 'foliate-js/epubcfi.js';
import { openEpub, installDomGlobals } from '../../spikes/epub/lib.mjs';

const fixture = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'epub', name);

test('foliate-js opens all EPUB fixtures: metadata, sections, TOC', async () => {
  const cases = [
    ['simple.epub', { title: '单章书', sections: 1, toc: 1 }],
    ['multi-chapter.epub', { title: '五章书', sections: 5, toc: 5 }],
    ['long-chapter.epub', { title: '长章书', sections: 1, toc: 1 }],
    ['with-image.epub', { title: '带图的书', sections: 1, toc: 1 }],
    ['epub3.epub', { title: '三代书', sections: 2, toc: 2 }],
  ];
  for (const [file, want] of cases) {
    const { book } = await openEpub(fixture(file));
    assert.equal(book.metadata?.title, want.title, `${file} title`);
    assert.equal(book.sections?.length, want.sections, `${file} sections`);
    const toc = await book.toc;
    assert.equal(toc?.length, want.toc, `${file} toc`);
    const ch1 = await book.sections[0]?.load?.();
    assert.ok(ch1, `${file} section 0 loads`);
  }
});

test('EPUB CFI round-trip: Range -> CFI -> Range preserves selection', async () => {
  const window = installDomGlobals();
  const doc = new JSDOM(CHAPTER_HTML, { contentType: 'application/xhtml+xml' }).window.document;
  const body = doc.getElementsByTagName('body')[0];

  // select text spanning inside one paragraph
  const p2 = body.querySelectorAll('p')[1];
  const range = window.document.createRange();
  range.setStart(p2.firstChild, 4);
  range.setEnd(p2.firstChild, 10);
  const expectedText = range.toString();

  const cfi = CFI.fromRange(range);
  assert.match(String(cfi), /^epubcfi\(/);

  const back = CFI.toRange(doc, CFI.parse(cfi));
  assert.equal(back.toString(), expectedText);
  assert.equal(back.startContainer, range.startContainer);
  assert.equal(back.startOffset, 4);
});

test('EPUB CFI round-trip across paragraph boundary', async () => {
  const window = installDomGlobals();
  const doc = new JSDOM(CHAPTER_HTML, { contentType: 'application/xhtml+xml' }).window.document;
  const body = doc.getElementsByTagName('body')[0];
  const p1 = body.querySelectorAll('p')[0];
  const p2 = body.querySelectorAll('p')[1];

  const range = window.document.createRange();
  range.setStart(p1.lastChild, p1.lastChild.length - 6);
  range.setEnd(p2.firstChild, 8);

  const cfi = CFI.fromRange(range);
  const back = CFI.toRange(doc, CFI.parse(cfi));
  assert.equal(back.toString(), range.toString());
});

test('stale CFI after content insertion shifts position -> quote fallback required', async () => {
  const window = installDomGlobals();
  const doc = new JSDOM(CHAPTER_HTML, { contentType: 'application/xhtml+xml' }).window.document;
  const body = doc.getElementsByTagName('body')[0];
  const p2 = body.querySelectorAll('p')[1];

  const range = window.document.createRange();
  range.setStart(p2.firstChild, 4);
  range.setEnd(p2.firstChild, 10);
  const quote = range.toString();
  const cfi = CFI.fromRange(range);

  // a new chapter edition inserts a paragraph before the target
  const edited = new JSDOM(
    CHAPTER_HTML.replace('<p>溪水在石头', '<p>新增的一版序言改变了结构。</p><p>溪水在石头'),
    { contentType: 'application/xhtml+xml' },
  ).window.document;

  const shifted = CFI.toRange(edited, CFI.parse(cfi));
  // the CFI now points at different text — the quote is the source of truth
  assert.notEqual(shifted.toString(), quote);
});

const CHAPTER_HTML = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第1章 山门</title></head>
<body>
<h1>第1章 山门</h1>
<p>山门在黎明前打开，露水沿着石阶一路铺下去。</p>
<p>溪水在石头间转弯，把光切成碎片。夜灯还挂在檐下，没有人去取。</p>
<p>他把行囊放在长坡下，回头望了一眼来路。</p>
</body>
</html>`;
