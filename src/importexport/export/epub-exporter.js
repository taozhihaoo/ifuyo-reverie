/**
 * Basic EPUB 3 export (M5 §34-36): a reliable migration-grade writer, NOT the
 * M9 publishing system. Document -> valid EPUB container (mimetype stored
 * first, container.xml, OPF package, nav document, XHTML chapters, minimal CSS).
 *
 * Hand-written over the shared STORE zip writer — no new dependency
 * (EPUB allows stored entries; readers accept them).
 */
import { makeZip } from '../../core/zip-writer.js';
import { parseMarkdownBlocks } from '../../reader/markdown-reader.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function xhtmlDocument(title, bodyHtml, lang = 'zh-CN') {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${bodyHtml}</body>
</html>`;
}

/** Very small markdown-block -> XHTML body renderer (paragraphs/headings/lists/quotes/pre). */
export function markdownBodyToXhtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let para = [];
  const escText = (t) => esc(t);
  const flush = () => {
    if (para.length) { out.push(`<p>${para.map(escText).join(' ')}</p>`); para = []; }
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${body.map(escText).join('\n')}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6}) (.+)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${escText(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { flush(); out.push('<hr/>'); i++; continue; }
    if (line.startsWith('> ')) {
      flush();
      const q = [];
      while (i < lines.length && lines[i].startsWith('> ')) q.push(lines[i++].slice(2));
      out.push(`<blockquote><p>${q.map(escText).join(' ')}</p></blockquote>`);
      continue;
    }
    if (/^[-*] /.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((it) => `<li>${escText(it)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      out.push(`<ol>${items.map((it) => `<li>${escText(it)}</li>`).join('')}</ol>`);
      continue;
    }
    if (line.trim() === '') { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}

const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const DEFAULT_CSS = 'body{font-family:serif;margin:1em;line-height:1.6}h1,h2,h3{line-height:1.25}pre{white-space:pre-wrap;background:#f6f6f6;padding:.6em}blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#444}img{max-width:100%}';

/**
 * Build an EPUB 3 file for one article.
 * Returns Buffer. Throws if the article is empty (M4 §36: report unsupported,
 * never emit a broken file).
 */
export function exportArticleToEpub({ title, author, markdown, publishedAt, sourceUrl, documentId, lang = 'zh-CN' }) {
  if (!markdown || markdown.trim().length === 0) {
    throw new Error('refusing to export an empty article to EPUB');
  }
  // split markdown by top-level headings into chapters (fallback: one chapter)
  const sections = [];
  const lines = markdown.split('\n');
  let cur = { title: title || 'Article', lines: [] };
  for (const line of lines) {
    const h1 = /^# (.+)$/.exec(line);
    if (h1 && cur.lines.length > 0) { sections.push(cur); cur = { title: h1[1], lines: [] }; }
    else cur.lines.push(line);
  }
  sections.push(cur);

  const chapters = sections.length > 0 ? sections : [{ title: title || 'Article', lines: lines }];
  const enc = (s) => esc(s);

  const files = [];
  files.push({ name: 'mimetype', data: Buffer.from('application/epub+zip') });
  files.push({ name: 'META-INF/container.xml', data: Buffer.from(containerXml) });

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
  ];
  const spine = [];
  chapters.forEach((ch, idx) => {
    const fileName = `chap${idx + 1}.xhtml`;
    const bodyHtml = markdownBodyToXhtml(ch.lines.join('\n'));
    files.push({
      name: `OEBPS/${fileName}`,
      data: Buffer.from(xhtmlDocument(ch.title || title, bodyHtml, lang)),
    });
    manifest.push(`<item id="chap${idx + 1}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="chap${idx + 1}"/>`);
  });
  files.push({ name: 'OEBPS/style.css', data: Buffer.from(DEFAULT_CSS) });

  const sourceLine = sourceUrl ? `<dc:source>${esc(sourceUrl)}</dc:source>` : '';
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:reverie:${esc(documentId)}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
<dc:language>${esc(lang)}</dc:language>
${author ? `<dc:creator>${esc(author)}</dc:creator>` : ''}
${publishedAt ? `<dc:date>${esc(publishedAt)}</dc:date>` : ''}
${sourceLine}
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>`;
  files.push({ name: 'OEBPS/content.opf', data: Buffer.from(opf) });

  const navItems = chapters.map((ch, idx) => `<li><a href="chap${idx + 1}.xhtml">${esc(ch.title)}</a></li>`).join('\n');
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}">
<head><title>TOC</title></head>
<body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>
${navItems}
</ol></nav></body></html>`;
  files.push({ name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) });

  return makeZip(files);
}

/** Basic EPUB structural validation (M5 §40): zip magic, mimetype, container.xml, OPF, nav. */
export function validateEpubBuffer(buf) {
  const errors = [];
  if (!buf || buf.length < 100) errors.push('文件过小');
  if (buf.slice(0, 2).toString() !== 'PK') errors.push('不是 ZIP 容器');
  // local file header of first entry: name length at offset 26, name at 30
  if (buf.length > 38) {
    const nameLen = buf.readUInt16LE(26);
    const firstName = buf.slice(30, 30 + nameLen).toString('utf8');
    if (firstName !== 'mimetype') errors.push('第一个 ZIP 条目必须是 mimetype');
    const method = buf.readUInt16LE(8);
    if (method !== 0) errors.push('mimetype 必须未压缩（STORE）');
  }
  const s = buf.toString('latin1');
  if (!s.includes('META-INF/container.xml')) errors.push('缺少 META-INF/container.xml');
  if (!s.includes('content.opf')) errors.push('缺少 content.opf');
  if (!s.includes('nav.xhtml')) errors.push('缺少 nav.xhtml');
  return { ok: errors.length === 0, errors };
}
