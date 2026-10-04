/**
 * Advanced EPUB builder (M9) — the single active EPUB export pipeline.
 * Pure domain: Reverie documents in (markdown blocks + assets + annotations),
 * EPUB zip entries out. No library access, no network, no UI (M9 §7/§10).
 *
 * Reuse map (M9 §75 — one pipeline, not five exporters):
 *   zip            = src/core/zip-writer.js (M5 STORE writer)
 *   block model    = src/reader/markdown-reader.js (M2/M6 canonical blocks)
 *   validation     = src/reader/epub-book.js (M6 container parser, in the service)
 * Determinism (M9 §61/103): identifier, chapter order, file names and content
 * derive only from the input; `dcterms:modified` is the single export-time
 * field (required by EPUB 3) and is excluded from determinism comparisons.
 */
import { createHash } from 'node:crypto';
import { parseMarkdownBlocks } from '../../reader/markdown-reader.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

/** EPUB-friendly reading CSS (M9 §19/§20/§54): readable, portable, no web layout. */
const BOOK_CSS = `body{font-family:serif;margin:1em 5%;line-height:1.7}
h1,h2,h3,h4{line-height:1.3;color:#222}
p{margin:.6em 0;text-align:justify}
a{color:#0366d6;text-decoration:none}
blockquote{border-left:3px solid #ccc;margin:1em 0;padding:.2em 0 .2em 1em;color:#444}
pre{white-space:pre-wrap;background:#f5f5f4;padding:.6em;border:1px solid #e2e2e0;font-size:.9em}
code{font-family:monospace;font-size:.9em;background:#f5f5f4;padding:0 .2em}
pre code{background:none;padding:0}
img{max-width:100%;height:auto}
figure{margin:1em 0;text-align:center}
figcaption{font-size:.85em;color:#666}
table{border-collapse:collapse;margin:1em 0;width:100%}
th,td{border:1px solid #ccc;padding:.35em .5em;text-align:left}
.titlepage{text-align:center;margin-top:4em}
.titlepage h1{font-size:1.7em;margin:.4em 0}
.titlepage .meta{color:#555;font-size:.95em;line-height:1.8}
.notes-section h2{border-bottom:1px solid #ddd;padding-bottom:.3em}
.note-item{margin:1em 0}
.note-item .quote{font-style:italic;color:#333;border-left:3px solid #bbb;padding-left:.8em;margin:.4em 0}
.note-item .note{color:#555;margin:.2em 0 .2em .8em}
.note-item .meta{font-size:.8em;color:#999}`;

/** Deterministic book identifier from the sorted document ids + title (M9 §14). */
export function epubIdentifier(documentIds, bookTitle) {
  const h = createHash('sha1')
    .update([...documentIds].sort().join('|')).update('§').update(bookTitle ?? '')
    .digest('hex');
  return `urn:reverie:book-${h.slice(0, 16)}`;
}

/** Stable chapter-title dedup: 原标题 → 原标题 (2) → 原标题 (3) … (M9 §13). */
export function dedupeTitles(titles) {
  const seen = new Map();
  return titles.map((t) => {
    const base = t || '无标题';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

// ------------------------------------------------------------ XHTML renderer
function escapeAttr(s) { return esc(s); }

function safeHrefUrl(href) {
  // M9 §48/§49: http(s)/mailto/anchors only; javascript:/data:/file: stripped
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith('#')) return href; // internal anchor
  return null;
}

/**
 * Markdown blocks (M2 model) → XHTML body string.
 * @param {Array} blocks parseMarkdownBlocks().blocks
 * @param {(src:string)=>{path:string|null}|null} resolveImage
 *   maps an `assets/...` reference to its EPUB image path; null/absent path
 *   drops the image and records a warning (M9 §23).
 */
export function markdownBlocksToXhtml(blocks, resolveImage = null) {
  const warnings = [];
  const renderSegments = (segments) => {
    let html = '';
    for (const s of segments ?? []) {
      switch (s.t) {
        case 'text': html += esc(s.v); break;
        case 'bold': html += `<strong>${esc(s.v)}</strong>`; break;
        case 'em': html += `<em>${esc(s.v)}</em>`; break;
        case 'code': html += `<code>${esc(s.v)}</code>`; break;
        case 'link': {
          const href = safeHrefUrl(s.href);
          html += href ? `<a href="${escapeAttr(href)}">${esc(s.v)}</a>` : esc(s.v);
          break;
        }
        case 'image': {
          const resolved = resolveImage?.(s.src);
          if (resolved?.path) {
            html += `<img src="${escapeAttr(resolved.path)}" alt="${escapeAttr(s.alt ?? '')}"/>`;
          } else if (s.src?.startsWith('assets/')) {
            warnings.push(`图片缺失或不可读: ${s.src}`);
          } else if (/^data:/i.test(s.src ?? '')) {
            warnings.push('内联 data: 图片未携带');
          } else if (s.src) {
            warnings.push(`非常规图片引用已移除: ${String(s.src).slice(0, 80)}`);
          }
          break;
        }
        default: html += esc(s.v ?? '');
      }
    }
    return html;
  };
  const parts = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'heading': parts.push(`<h${b.level}>${renderSegments(b.segments)}</h${b.level}>`); break;
      case 'paragraph': parts.push(`<p>${renderSegments(b.segments)}</p>`); break;
      case 'code': parts.push(`<pre><code>${esc(b.text)}</code></pre>`); break; // §52: pre served verbatim
      case 'quote': parts.push(`<blockquote><p>${renderSegments(b.segments)}</p></blockquote>`); break;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        const items = (b.items ?? []).map((it) => `<li>${renderSegments(it.segments)}</li>`).join('');
        parts.push(`<${tag}>${items}</${tag}>`);
        break;
      }
      case 'hr': parts.push('<hr/>'); break;
      default: parts.push(`<p>${esc(b.text ?? '')}</p>`);
    }
  }
  return { html: parts.join('\n'), warnings };
}

// ------------------------------------------------------------ builder
function xhtmlPage(title, bodyHtml, lang) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${bodyHtml}
</body>
</html>`;
}

/**
 * Build the complete EPUB zip model for one or many documents.
 *
 * @param {Array<{documentId:string, title:string, author?:string|null,
 *   publishedAt?:string|null, sourceUrl?:string|null, lang?:string,
 *   markdown:string, annotations?:Array<{quotedText?:string, note?:string, createdAt?:string}>}>} documents
 * @param {{bookTitle?:string, author?:string, lang?:string,
 *   includeImages?:boolean, includeHighlights?:boolean, includeNotes?:boolean,
 *   generateToc?:boolean, now?:Date}} options
 * @returns {{buffer:Buffer, chapterCount:number, assetCount:number, warnings:string[], identifier:string}}
 */
export function buildEpub(documents, options = {}) {
  const {
    bookTitle, author, lang = 'zh-CN',
    includeImages = true, includeHighlights = false, includeNotes = false,
    generateToc = true,
    now = new Date(),
  } = options;

  const docs = (documents ?? []).filter((d) => (d.markdown ?? '').trim().length > 0);
  if (docs.length === 0) {
    throw new Error('没有可导出的非空文档');
  }
  const isBook = docs.length > 1 || Boolean(bookTitle);
  const warnings = [];
  const assets = new Map(); // sha key -> {zipPath, doc, sourceRef}
  const files = [];

  // ---- chapters: one per document (multi-doc) or per H1 section (single) (M9 §12)
  const chapterSources = [];
  if (!isBook) {
    const single = docs[0];
    const { blocks } = parseMarkdownBlocks(single.markdown);
    // split at top-level h1 headings like M5 did, keeping front matter intact
    let cur = { title: single.title, blocks: [] };
    const out = [cur];
    for (const b of blocks) {
      if (b.type === 'heading' && b.level === 1 && cur.blocks.length > 0) {
        cur = { title: b.segments?.map((s) => s.v ?? '').join('') || single.title, blocks: [] };
        out.push(cur);
      } else cur.blocks.push(b);
    }
    for (const c of out) chapterSources.push({ doc: single, title: c.title, blocks: c.blocks });
  } else {
    for (const d of docs) {
      const { blocks } = parseMarkdownBlocks(d.markdown);
      chapterSources.push({ doc: d, title: d.title, blocks });
    }
  }

  const chapterTitles = dedupeTitles(chapterSources.map((c) => c.title ?? '无标题'));

  // ---- chapters → files
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
  ];
  const spine = [];
  const tocEntries = [];
  const chapterCount = chapterSources.length;

  chapterSources.forEach((ch, idx) => {
    const id = `chap${idx + 1}`;
    const fileName = `${id}.xhtml`;
    // image resolution is chapter-scoped: asset files live beside their own
    // article (content-addressed, so cross-document dedup still collapses)
    const chapterResolveImage = (src) => {
      if (!includeImages || !src?.startsWith('assets/')) return { path: null };
      const m = /^assets\/([0-9a-f]{64})\.([A-Za-z0-9]{1,8})$/.exec(src);
      if (!m) return { path: null };
      const key = `${m[1]}.${m[2].toLowerCase()}`;
      if (!assets.has(key)) {
        assets.set(key, { key, zipPath: `images/${key}`, doc: ch.doc, sourceRef: src });
      }
      return { path: assets.get(key).zipPath };
    };
    const { html, warnings: chWarn } = markdownBlocksToXhtml(ch.blocks, chapterResolveImage);
    warnings.push(...chWarn.map((w) => `第 ${idx + 1} 章: ${w}`));
    const heading = `<h1>${esc(chapterTitles[idx])}</h1>`;
    const source = ch.doc.sourceUrl
      ? `<p class="meta">来源：<a href="${escapeAttr(safeHrefUrl(ch.doc.sourceUrl) ?? '')}">${escapeAttr(ch.doc.sourceUrl)}</a></p>`
      : '';
    const meta = [
      ch.doc.author ? `<p class="meta">作者：${esc(ch.doc.author)}</p>` : '',
      ch.doc.publishedAt ? `<p class="meta">发布于 ${esc(ch.doc.publishedAt)}</p>` : '',
    ].join('');
    files.push({
      name: `OEBPS/${fileName}`,
      data: Buffer.from(xhtmlPage(chapterTitles[idx], heading + meta + source + html, ch.doc.lang ?? lang)),
    });
    manifest.push(`<item id="${id}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    tocEntries.push({ file: fileName, title: chapterTitles[idx] });
  });

  // ---- highlights / notes appendix (M9 §37/§39: as-saved content, no internal ids)
  if (includeHighlights || includeNotes) {
    const items = [];
    for (const d of docs) {
      for (const a of d.annotations ?? []) {
        if (a.type === 'bookmark') continue;
        const quote = includeHighlights ? (a.quotedText ?? '').trim() : '';
        const note = includeNotes ? (a.note ?? '').trim() : '';
        if (!quote && !note) continue;
        const date = a.createdAt ? a.createdAt.slice(0, 10) : '';
        items.push(
          `<div class="note-item">`
          + (quote ? `<p class="quote">${esc(quote)}</p>` : '')
          + (note ? `<p class="note">${esc(note)}</p>` : '')
          + `<p class="meta">${esc(d.title)}${date ? ` · ${esc(date)}` : ''}</p>`
          + `</div>`,
        );
      }
    }
    if (items.length > 0) {
      const id = 'notes';
      const body = `<section class="notes-section"><h1>标注与笔记</h1>${items.join('\n')}</section>`;
      files.push({ name: 'OEBPS/notes.xhtml', data: Buffer.from(xhtmlPage('标注与笔记', body, lang)) });
      manifest.push(`<item id="${id}" href="notes.xhtml" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="${id}"/>`);
      tocEntries.push({ file: 'notes.xhtml', title: '标注与笔记' });
    }
  }

  // ---- title page for book mode (M9 §67; kept modest per §92)
  const title = bookTitle || docs[0].title;
  if (isBook) {
    const byline = author || [...new Set(docs.map((d) => d.author).filter(Boolean))].join('、');
    const body = `<section class="titlepage"><h1>${esc(title)}</h1>`
      + (byline ? `<p class="meta">${esc(byline)}</p>` : '')
      + `<p class="meta">${esc(String(now.getFullYear()))}</p>`
      + `<p class="meta">共 ${chapterCount} 篇 · Archived by Reverie</p></section>`;
    files.push({ name: 'OEBPS/title.xhtml', data: Buffer.from(xhtmlPage(title, body, lang)) });
    manifest.splice(2, 0, '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>');
    spine.unshift('<itemref idref="title" linear="no"/>');
  }

  // ---- assets (buffers attached by the service; builder only assigns paths)
  const assetEntries = [...assets.values()];
  for (const a of assetEntries) {
    manifest.push(`<item id="img-${a.key.slice(0, 16)}" href="${escapeAttr(a.zipPath)}" media-type="image/${a.key.endsWith('.svg') ? 'svg+xml' : a.key.endsWith('.gif') ? 'gif' : a.key.endsWith('.png') ? 'png' : a.key.endsWith('.webp') ? 'webp' : 'jpeg'}"/>`);
  }

  // ---- OPF
  const identifier = epubIdentifier(docs.map((d) => d.documentId), title);
  const metaLines = [
    `<dc:identifier id="bookid">${esc(identifier)}</dc:identifier>`,
    `<dc:title>${esc(title)}</dc:title>`,
    `<dc:language>${esc(lang)}</dc:language>`,
    author ? `<dc:creator>${esc(author)}</dc:creator>` : '',
    ...[...new Set(docs.map((d) => d.author).filter(Boolean))].map((a) => `<dc:creator>${esc(a)}</dc:creator>`),
    docs[0]?.publishedAt ? `<dc:date>${esc(docs[0].publishedAt)}</dc:date>` : '',
    ...docs.filter((d) => d.sourceUrl).slice(0, 1).map((d) => `<dc:source>${esc(d.sourceUrl)}</dc:source>`),
    `<meta property="dcterms:modified">${now.toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>`,
  ].filter(Boolean).join('\n');

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metaLines}
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>`;
  files.push({ name: 'OEBPS/content.opf', data: Buffer.from(opf) });

  // ---- navigation document (M9 §27: chapter level; stable order = spine)
  const navLis = tocEntries.map((t) => `<li><a href="${esc(t.file)}">${esc(t.title)}</a></li>`).join('\n');
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}">
<head><title>目录</title></head>
<body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>
${generateToc ? navLis : ''}
</ol></nav></body></html>`;
  files.push({ name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) });

  // ---- assemble container (order matters: mimetype first, STORE)
  files.unshift(
    { name: 'mimetype', data: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', data: Buffer.from(CONTAINER_XML) },
  );
  files.push({ name: 'OEBPS/style.css', data: Buffer.from(BOOK_CSS) });

  return {
    files,
    chapterCount,
    assetCount: assetEntries.length,
    assets,
    warnings,
    identifier,
    title,
    lang,
  };
}
