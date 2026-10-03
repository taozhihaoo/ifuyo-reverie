import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { parseMarkdownBlocks } from '../../src/reader/markdown-reader.js';

// load the renderer's script (same file the app loads) — ESM-safe
await import('../../app/renderer/reader-anchor.js');
const ReaderAnchor = globalThis.ReaderAnchor;

const fixture = (name) => fsp.readFile(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'annotations', name),
  'utf8',
);

/** Minimal block->DOM builder mirroring app/renderer/app.js (text contract). */
function renderBlocks(blocks, document, ctx = { resolveImage: async () => null }) {
  const frag = document.createDocumentFragment();
  const renderSegments = (parent, segments) => {
    for (const s of segments) {
      if (s.t === 'text') parent.appendChild(document.createTextNode(s.v));
      else if (s.t === 'code' || s.t === 'bold' || s.t === 'em' || s.t === 'link') {
        const el = document.createElement({ code: 'code', bold: 'strong', em: 'em', link: 'a' }[s.t]);
        el.textContent = s.v;
        parent.appendChild(el);
      } else if (s.t === 'image') {
        const img = document.createElement('img');
        img.alt = s.alt ?? '';
        parent.appendChild(img); // images contribute '' to textContent
      }
    }
  };
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'quote') {
      const tag = b.type === 'heading' ? `h${b.level}` : b.type === 'quote' ? 'blockquote' : 'p';
      const el = document.createElement(tag);
      renderSegments(el, b.segments, ctx);
      frag.appendChild(el);
    } else if (b.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = b.text;
      pre.appendChild(code);
      frag.appendChild(pre);
    } else if (b.type === 'list') {
      const list = document.createElement(b.ordered ? 'ol' : 'ul');
      for (const item of b.items) {
        const li = document.createElement('li');
        renderSegments(li, item.segments, ctx);
        list.appendChild(li);
      }
      frag.appendChild(list);
    } else if (b.type === 'table') {
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      for (const c of b.header) {
        const th = document.createElement('th');
        th.textContent = c;
        tr.appendChild(th);
      }
      table.appendChild(tr);
      for (const row of b.rows) {
        const rowTr = document.createElement('tr');
        for (const c of row) {
          const td = document.createElement('td');
          td.textContent = c;
          rowTr.appendChild(td);
        }
        table.appendChild(rowTr);
      }
      frag.appendChild(table);
    } else if (b.type === 'hr') {
      frag.appendChild(document.createElement('hr'));
    }
  }
  return frag;
}

const FIXTURES = ['short.md', 'multi-paragraph.md', 'long.md', 'headings.md', 'lists.md', 'code.md', 'links.md', 'zh.md', 'en.md', 'ja.md', 'repeated.md', 'cross-block.md'];

test('canonical text contract: DOM textContent (from blocks) === canonicalText (all fixtures)', async () => {
  for (const f of FIXTURES) {
    const md = await fixture(f);
    const { blocks, canonicalText } = parseMarkdownBlocks(md);
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const content = dom.window.document.createElement('div');
    content.appendChild(renderBlocks(blocks, dom.window.document));
    assert.equal(content.textContent, canonicalText, `${f}: DOM text must equal canonical text`);
  }
});

test('ReaderAnchor: selection -> anchor parts -> main resolver -> range round-trip', async () => {
  const md = await fixture('multi-paragraph.md');
  const { blocks, canonicalText } = parseMarkdownBlocks(md);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const content = dom.window.document.createElement('div');
  content.appendChild(renderBlocks(blocks, dom.window.document));
  dom.window.document.body.appendChild(content);

  // user selects text spanning inside paragraph 2
  const quote = '本地优先意味着网络只是手段';
  const start = canonicalText.indexOf(quote);
  const selStart = start + 2;
  const selEnd = start + quote.length - 1; // partial quote selection
  const range = dom.window.document.createRange();
  // locate DOM nodes for offsets via ReaderAnchor (reverse direction)
  const full = ReaderAnchor.rangeForOffsets(content, selStart, selEnd);
  assert.ok(full, 'range must be mappable');
  range.setStart(full.startContainer, full.startOffset);
  range.setEnd(full.endContainer, full.endOffset);

  // selection -> parts (renderer side)
  const parts = ReaderAnchor.selectionParts(range, content);
  assert.ok(parts);
  assert.ok(parts.quote.length > 4);

  // parts -> authoritative resolver (main side)
  const { resolveTextAnchor } = await import('../../src/annotation/resolver.js');
  const resolved = resolveTextAnchor(parts, canonicalText);
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual([resolved.start, resolved.end], [parts.position.start, parts.position.end]);

  // resolved offsets -> DOM range again (renderer side) — identical range
  const back = ReaderAnchor.rangeForOffsets(content, resolved.start, resolved.end);
  assert.equal(back.toString(), range.toString());
});

test('ReaderAnchor: cross-block selection maps through canonical offsets', async () => {
  const md = await fixture('cross-block.md');
  const { blocks, canonicalText } = parseMarkdownBlocks(md);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const content = dom.window.document.createElement('div');
  content.appendChild(renderBlocks(blocks, dom.window.document));
  dom.window.document.body.appendChild(content);

  // select from inside the FIRST paragraph to inside the SECOND (cross-block)
  const start = canonicalText.indexOf('SelectionWillCrossTheBlockBoundary');
  const end = canonicalText.indexOf('覆盖的文字') + '覆盖的文字'.length;
  const range = ReaderAnchor.rangeForOffsets(content, start, end);
  assert.ok(range, 'cross-block range must be mappable');
  assert.ok(range.toString().includes('SelectionWillCrossTheBlockBoundary'));
  assert.ok(range.toString().includes('覆盖的文字'));

  const parts = ReaderAnchor.selectionParts(range, content);
  const { resolveTextAnchor } = await import('../../src/annotation/resolver.js');
  const resolved = resolveTextAnchor(parts, canonicalText);
  assert.equal(resolved.status, 'resolved');
  assert.equal(canonicalText.slice(resolved.start, resolved.end), parts.quote);
});
