/**
 * Reader-side anchor mapping (renderer classic script; ALSO exercised
 * directly by node tests via the module.exports shim at the bottom).
 *
 * Responsibility is deliberately narrow (M2 §25): map canonical text offsets
 * <-> DOM positions inside the rendered article container. Resolution itself
 * is authoritative in the main process (src/annotation/resolver.js) against
 * the canonical text produced by src/reader/markdown-reader.js.
 */
(function (rootFactory) {
  const api = rootFactory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.ReaderAnchor = api;
})(function () {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  function collectTextNodes(rootEl) {
    const doc = rootEl.ownerDocument;
    const walker = doc.createTreeWalker(rootEl, 4 /* SHOW_TEXT */);
    const nodes = [];
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

  /** Char-offset index of the rendered article (must equal canonical text). */
  function textIndex(rootEl) {
    const entries = [];
    let text = '';
    for (const node of collectTextNodes(rootEl)) {
      const start = text.length;
      text += node.nodeValue;
      entries.push({ node, start, end: text.length });
    }
    return { text, entries };
  }

  /** canonical [start,end) -> DOM Range (or null when out of sync). */
  function rangeForOffsets(rootEl, start, end) {
    const index = textIndex(rootEl);
    if (end > index.text.length) return null;
    const locate = (offset) => {
      for (const e of index.entries) {
        if (offset >= e.start && offset <= e.end) return { node: e.node, offset: offset - e.start };
      }
      return null;
    };
    const s = locate(start);
    const e = locate(end);
    if (!s || !e) return null;
    const doc = rootEl.ownerDocument;
    const range = doc.createRange();
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
    return range;
  }

  /** DOM Selection -> anchor parts {quote, prefix, suffix} in rendered text. */
  function selectionParts(range, rootEl, contextLength = 32) {
    const index = textIndex(rootEl);
    const locate = (node, offset) => {
      for (const e of index.entries) {
        if (e.node === node) return e.start + offset;
      }
      return null;
    };
    const cmp = range.startContainer.compareDocumentPosition(range.endContainer);
    const backwards = Boolean(cmp & 2 /* PRECEDING */) && range.startContainer !== range.endContainer;
    const startPt = backwards
      ? { node: range.endContainer, offset: range.endOffset }
      : { node: range.startContainer, offset: range.startOffset };
    const endPt = backwards
      ? { node: range.startContainer, offset: range.startOffset }
      : { node: range.endContainer, offset: range.endOffset };
    const start = locate(startPt.node, startPt.offset);
    const end = locate(endPt.node, endPt.offset);
    if (start === null || end === null || start >= end) return null;
    const quote = index.text.slice(start, end);
    return {
      quote,
      prefix: index.text.slice(Math.max(0, start - contextLength), start),
      suffix: index.text.slice(end, end + contextLength),
      position: { start, end },
    };
  }

  return { textIndex, rangeForOffsets, selectionParts };
});
