import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createAnchorFromRange, resolveAnchorInDom } from '../../src/annotation/anchor.js';
import { resolveTextAnchor } from '../../src/annotation/resolver.js';

const ARTICLE = `<article id="art">
<h1>文件是真相</h1>
<p>在设计 Reverie 时，我们把开放格式文件放在第一位。数据库只是索引与缓存，随时可以删除并重建。</p>
<p>第二条原则是本地优先。网络用于保存网页与获取订阅，但资料永远属于用户。</p>
<p>第三条原则是阅读优先。所有交互都要服从长时间阅读的舒适性。</p>
</article>`;

const docOf = (html) => new JSDOM(html).window.document;

function select(doc, text) {
  // select the first occurrence of `text` inside a single text node
  const root = doc.getElementById('art');
  const walker = doc.createTreeWalker(root, 4);
  let node = walker.nextNode();
  while (node) {
    const idx = node.nodeValue.indexOf(text);
    if (idx !== -1) {
      const range = doc.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      return range;
    }
    node = walker.nextNode();
  }
  throw new Error('text not found: ' + text);
}

test('same document: create anchor -> resolve restores the identical DOM range', () => {
  const doc = docOf(ARTICLE);
  const root = doc.getElementById('art');
  const range = select(doc, '数据库只是索引与缓存');
  const anchor = createAnchorFromRange(range, root);
  assert.equal(anchor.kind, 'text-quote');
  assert.equal(anchor.quote, '数据库只是索引与缓存');

  const back = resolveAnchorInDom(anchor, root);
  assert.equal(back.status, 'resolved');
  assert.equal(back.quality, 'exact-position');
  assert.equal(back.range.startContainer, range.startContainer);
  assert.equal(back.range.startOffset, range.startOffset);
  assert.equal(back.range.endContainer, range.endContainer);
  assert.equal(back.range.endOffset, range.endOffset);
});

test('selection spanning multiple text nodes round-trips', () => {
  const doc = docOf(ARTICLE);
  const root = doc.getElementById('art');
  // "阅读优先" ends one text node; select across <p> boundary incl. tag gap
  const range = doc.createRange();
  const h1 = root.querySelector('h1').firstChild;
  const p1 = root.querySelectorAll('p')[0].firstChild;
  range.setStart(h1, 2);
  range.setEnd(p1, 6);
  const anchor = createAnchorFromRange(range, root);
  const back = resolveAnchorInDom(anchor, root);
  assert.equal(back.status, 'resolved');
  assert.equal(back.range.toString(), range.toString());
});

test('slightly changed document: position stale, quote re-locates via prefix/suffix', () => {
  const doc = docOf(ARTICLE);
  const root = doc.getElementById('art');
  const anchor = createAnchorFromRange(select(doc, '本地优先'), root);
  assert.equal(anchor.position.end - anchor.position.start, 4);

  // mutate: a new paragraph shifts every offset
  const changed = docOf(ARTICLE.replace('<p>第二条原则', '<p>新增的引言段落改变了偏移量。</p><p>第二条原则'));
  const changedRoot = changed.getElementById('art');
  const back = resolveAnchorInDom(anchor, changedRoot);
  assert.equal(back.status, 'resolved');
  assert.notEqual(back.quality, 'exact-position');
  assert.equal(back.range.toString(), '本地优先');
});

test('whitespace-damaged document still re-locates via normalized quote', () => {
  const doc = docOf(ARTICLE);
  const root = doc.getElementById('art');
  const anchor = createAnchorFromRange(select(doc, '资料永远属于用户'), root);

  const damaged = docOf(ARTICLE.replace('资料永远属于用户', '资料\n 永远属于用户'));
  const back = resolveAnchorInDom(anchor, damaged.getElementById('art'));
  assert.equal(back.status, 'resolved');
  assert.equal(back.quality, 'flexible-whitespace');
  assert.equal(back.range.toString(), '资料\n 永远属于用户');
});

test('quote deleted: anchor is orphaned, never an error, never deleted', () => {
  const doc = docOf(ARTICLE);
  const root = doc.getElementById('art');
  const anchor = createAnchorFromRange(select(doc, '阅读优先'), root);
  const destroyed = docOf(ARTICLE.replace('第三条原则是阅读优先。', '第三条原则被改写了。'));
  const back = resolveAnchorInDom(anchor, destroyed.getElementById('art'));
  assert.deepEqual(back, { status: 'orphaned' });
});

test('resolver: ambiguous quote disambiguated by prefix context', () => {
  const text = 'A 常见词 B 常见词 C';
  const anchor = { quote: '常见词', prefix: 'B ', suffix: ' C' };
  const r = resolveTextAnchor(anchor, text);
  assert.equal(r.status, 'resolved');
  assert.equal(text.slice(r.start, r.end), '常见词');
  assert.equal(r.start, text.lastIndexOf('常见词')); // the one preceded by "B"
});

test('resolver: stale position verified against quote, not trusted blindly', () => {
  const text = 'hello world';
  const anchor = { quote: 'world', position: { start: 0, end: 5 } }; // position now points at "hello"
  const r = resolveTextAnchor(anchor, text);
  assert.equal(r.status, 'resolved');
  assert.equal(r.start, 6);
});

test('resolver: collapsed-whitespace match maps back to original offsets', () => {
  const text = 'before  hello   world  after';
  const r = resolveTextAnchor({ quote: 'hello world', prefix: 'before', suffix: 'after' }, text);
  assert.equal(r.status, 'resolved');
  assert.equal(r.quality, 'normalized-quote');
  assert.equal(text.slice(r.start, r.end), 'hello   world');
});

test('resolver: empty quote rejected', () => {
  assert.throws(() => resolveTextAnchor({ quote: '' }, 'anything'));
});
