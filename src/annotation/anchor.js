/**
 * DOM integration for text-quote anchors (web/article documents).
 * Maps character offsets in the element's visible text content to
 * (Text node, offset) pairs so anchors can be applied as DOM Ranges.
 */
import { resolveTextAnchor } from './resolver.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);

/** Collect visible text nodes under `root` in document order. */
export function collectTextNodes(root) {
  const nodes = [];
  const doc = root.ownerDocument ?? root;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let cur = walker.nextNode();
  while (cur) {
    let p = cur.parentElement;
    let skip = false;
    while (p) {
      if (SKIP_TAGS.has(p.tagName)) { skip = true; break; }
      p = p.parentElement;
    }
    if (!skip && cur.nodeValue.length > 0) nodes.push(cur);
    cur = walker.nextNode();
  }
  return nodes;
}

/** Build a flat text index of `root`: full text + per-node offset ranges. */
export function buildTextIndex(root) {
  const nodes = collectTextNodes(root);
  const entries = [];
  let text = '';
  for (const node of nodes) {
    const start = text.length;
    text += node.nodeValue;
    entries.push({ node, start, end: text.length });
  }
  return { text, entries };
}

/** Char offset -> (node, offset) within the index. */
function locate(index, charOffset) {
  for (const e of index.entries) {
    if (charOffset >= e.start && charOffset <= e.end) {
      return { node: e.node, offset: charOffset - e.start };
    }
  }
  throw new Error(`offset ${charOffset} outside text index`);
}

const DOCUMENT_POSITION_PRECEDING = 2;

/**
 * Create a GenericTextAnchor from an existing DOM Range.
 * Returns { kind:'text-quote', quote, prefix, suffix, position }.
 */
export function createAnchorFromRange(range, root) {
  if (!range || range.collapsed) throw new Error('range must be non-collapsed');
  const index = buildTextIndex(root);
  // order the two boundary points
  const cmp = range.startContainer.compareDocumentPosition(range.endContainer);
  const [startPt, endPt] =
    cmp & DOCUMENT_POSITION_PRECEDING && range.startContainer !== range.endContainer
      ? [{ node: range.endContainer, offset: range.endOffset }, { node: range.startContainer, offset: range.startOffset }]
      : [{ node: range.startContainer, offset: range.startOffset }, { node: range.endContainer, offset: range.endOffset }];

  const toOffset = (pt) => {
    for (const e of index.entries) {
      if (e.node === pt.node) return e.start + pt.offset;
    }
    throw new Error('range boundary outside text index');
  };
  const start = toOffset(startPt);
  const end = toOffset(endPt);
  if (start >= end) throw new Error('range selects no text');

  const quote = index.text.slice(start, end);
  return {
    kind: 'text-quote',
    quote,
    prefix: index.text.slice(Math.max(0, start - 32), start),
    suffix: index.text.slice(end, end + 32),
    position: { start, end },
  };
}

/**
 * Resolve an anchor inside a rendered DOM element.
 * Returns { status:'resolved', range, start, end, quality }
 *       or { status:'orphaned' }.
 */
export function resolveAnchorInDom(anchor, root) {
  const index = buildTextIndex(root);
  const result = resolveTextAnchor(anchor, index.text);
  if (result.status !== 'resolved') return result;
  const s = locate(index, result.start);
  const e = locate(index, result.end);
  const doc = root.ownerDocument ?? root;
  const range = doc.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return { status: 'resolved', range, start: result.start, end: result.end, quality: result.quality };
}
