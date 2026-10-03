/**
 * article.md serializer (M1 §8): sanitized article HTML -> readable Markdown.
 *
 * Conversion rules (deliberate, documented — readability over faux losslessness):
 *   h1-h6      -> #-###### headings
 *   p          -> paragraph + blank line
 *   blockquote -> "> " prefix
 *   pre        -> fenced code block (language from <code class="language-x">)
 *   ul/ol/li   -> "- " / "1." with 2-space nesting
 *   table      -> GFM pipe table (first row = header); pipes escaped in cells
 *   img        -> ![alt](src); src rewritten via assetMap (remote -> local)
 *   a          -> [text](href) for http(s)/mailto/# anchors, else plain text
 *   em/i strong/b code del/s -> *x* **x** `x` ~~x~~
 *   br/hr      -> newline / ---
 *   script/style/nav/... -> dropped (sanitizer already removed most)
 * Anything Markdown cannot express degrades to readable text on purpose.
 */
import { JSDOM } from 'jsdom';

const CONTAINERS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'BODY', 'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION_PLACEHOLDER', 'SPAN', 'CENTER', 'FONT']);
const DROP = new Set(['SCRIPT', 'STYLE', 'NAV', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'VIDEO', 'AUDIO', 'CANVAS', 'OBJECT', 'EMBED', 'LINK', 'META', 'HEAD']);

const escapeInline = (s) => s
  .replace(/\\/g, '\\\\')
  .replace(/([*_[\]`])/g, '\\$1');

const inlineText = (node) => {
  if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (DROP.has(tag)) return '';
  const kids = [...node.childNodes].map(inlineText).join('');
  switch (tag) {
    case 'BR': return '\n';
    case 'EM': case 'I': return kids.trim() ? `*${kids.trim()}*` : '';
    case 'STRONG': case 'B': return kids.trim() ? `**${kids.trim()}**` : '';
    case 'CODE': return kids.trim() ? `\`${kids.trim()}\`` : '';
    case 'DEL': case 'S': case 'STRIKE': return kids.trim() ? `~~${kids.trim()}~~` : '';
    case 'A': {
      const href = node.getAttribute('href') ?? '';
      if (/^(https?:|mailto:|#)/i.test(href) && kids.trim()) return `[${kids.trim()}](${href})`;
      return kids;
    }
    case 'IMG': return '';
    default: return kids;
  }
};

const collectInline = (node) => [...node.childNodes].map(inlineText).join('').replace(/ +/g, ' ').trim();

function serializeTable(table) {
  const rows = [...table.querySelectorAll('tr')];
  if (rows.length === 0) return '';
  const cellText = (tr) => [...tr.querySelectorAll('th,td')].map((c) => collectInline(c).replace(/\|/g, '\\|').replace(/\n/g, ' '));
  const header = cellText(rows[0]);
  if (header.length === 0) return '';
  const width = Math.max(header.length, ...rows.slice(1).map((r) => cellText(r).length), 1);
  const pad = (cells) => {
    const out = [...cells];
    while (out.length < width) out.push('');
    return out;
  };
  const lines = [
    `| ${pad(header).join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...rows.slice(1).map((r) => `| ${pad(cellText(r)).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function serializeList(list, indent = '') {
  const ordered = list.tagName === 'OL';
  let n = 1;
  const lines = [];
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue;
    const marker = ordered ? `${n++}. ` : '- ';
    const parts = [];
    for (const child of li.childNodes) {
      if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
        parts.push('\n' + serializeList(child, indent + '  '));
      } else if (child.nodeType === 1 && child.tagName === 'P') {
        parts.push(collectInline(child));
      } else {
        parts.push(inlineText(child));
      }
    }
    lines.push(indent + marker + parts.join(' ').replace(/\n{2,}/g, '\n' + indent).trim());
  }
  return lines.join('\n');
}

const imageSrc = (img, assetMap) => {
  const src = img.getAttribute('src') ?? '';
  if (!src) return null;
  return assetMap?.get(src) ?? src;
};

function serializeBlock(node, assetMap, out) {
  if (node.nodeType === 3) {
    const t = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName;
  if (DROP.has(tag)) return;

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const text = collectInline(node);
    if (text) out.push(`${'#'.repeat(level)} ${escapeInline(text)}`);
    return;
  }
  if (tag === 'P') {
    // paragraphs may contain standalone images
    for (const img of node.querySelectorAll('img')) {
      const src = imageSrc(img, assetMap);
      if (src) out.push(`![${(img.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')}](${src})`);
    }
    const text = collectInline(node);
    if (text) out.push(text);
    return;
  }
  if (tag === 'BLOCKQUOTE') {
    const inner = [];
    for (const child of node.childNodes) serializeBlock(child, assetMap, inner);
    const quoted = inner.join('\n\n').split('\n').map((l) => `> ${l}`).join('\n');
    if (quoted.trim() !== '>') out.push(quoted);
    return;
  }
  if (tag === 'PRE') {
    const code = node.querySelector('code');
    const lang = /language-([\w-]+)/.exec(code?.className ?? '')?.[1] ?? '';
    const body = (code ?? node).textContent.replace(/\s+$/, '');
    out.push('```' + lang + '\n' + body + '\n```');
    return;
  }
  if (tag === 'UL' || tag === 'OL') {
    const list = serializeList(node);
    if (list) out.push(list);
    return;
  }
  if (tag === 'TABLE') {
    const t = serializeTable(node);
    if (t) out.push(t);
    return;
  }
  if (tag === 'HR') {
    out.push('---');
    return;
  }
  if (tag === 'IMG') {
    const src = imageSrc(node, assetMap);
    if (src) out.push(`![${(node.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')}](${src})`);
    return;
  }
  if (tag === 'FIGURE') {
    const img = node.querySelector('img');
    if (img) {
      const src = imageSrc(img, assetMap);
      if (src) out.push(`![${(img.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')}](${src})`);
    }
    const caption = node.querySelector('figcaption');
    if (caption) {
      const t = collectInline(caption);
      if (t) out.push(`*${t}*`);
    }
    return;
  }
  // transparent containers (div/section/article/main/span/...)
  for (const child of node.childNodes) serializeBlock(child, assetMap, out);
}

/**
 * Serialize article HTML to Markdown.
 * assetMap: Map<absoluteSrcUrl, relativeLocalPath> — rewrites <img src>.
 */
export function htmlToMarkdown(html, { assetMap = new Map() } = {}) {
  const doc = new JSDOM(html).window.document;
  const out = [];
  for (const child of doc.body.childNodes) serializeBlock(child, assetMap, out);
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
