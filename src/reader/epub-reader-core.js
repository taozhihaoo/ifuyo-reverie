/**
 * Main-process EPUB Reader Adapter core (M6 §20/§28): opens a book.epub from
 * the library, parses metadata/spine/TOC, extracts searchable text per
 * chapter. Testable core; the renderer displays via foliate-js sharing the
 * same locator model (CFI) — never a second annotation/search system.
 */
import { openEpubContainer, parseOpf, extractToc, EpubError } from './epub-book.js';
import { sanitizeArticleHtml } from '../security/sanitize-html.js';
import { JSDOM } from 'jsdom';

export { EpubError };

const posixJoin = (dir, href) => {
  const parts = (dir ? dir.split('/') : []).concat(href.split('/'));
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
};

const stripHtmlToText = (xml) => {
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(xml);
  const src = bodyMatch ? bodyMatch[1] : xml;
  return src
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

function chapterTitle(xml) {
  const m = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(xml) ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(xml);
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || null;
}

/**
 * Open a book session: container + book model + TOC + chapters (text + href).
 * Returns a plain-domain object; container handles are kept internal.
 */
export async function openBookSession(epubPath) {
  const container = await openEpubContainer(epubPath);
  const opfXml = await container.readEntryText(container.opfPath);
  if (opfXml === null) throw new EpubError('PARSE_ERROR', 'OPF 无法读取');
  const book = parseOpf(opfXml, container.opfDir);
  const readText = (name) => container.readEntryText(name);
  const toc = await extractToc(container, book, readText).catch(() => []);

  const chapters = [];
  for (let i = 0; i < book.spine.length; i++) {
    const item = book.manifest.get(book.spine[i].idref);
    if (!item || !/x?html/.test(item.mediaType)) continue;
    const href = posixJoin(book.opfDir, item.href);
    const xml = await readText(href);
    if (xml === null) continue;
    const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(xml);
    const body = bodyMatch ? bodyMatch[1] : xml;
    const sanitized = await sanitizeArticleHtml(body);
    // canonical chapter text = textContent of the SAME sanitized HTML the
    // renderer inserts — main and renderer stay byte-consistent (M6 §33).
    // Fragment parsing (innerHTML), NOT document parsing: JSDOM-as-document
    // would drop the leading whitespace text node the renderer keeps.
    const holder = new JSDOM('').window.document.createElement('div');
    holder.innerHTML = sanitized;
    const text = holder.textContent;
    if (text.trim().length === 0) continue;
    chapters.push({
      index: chapters.length,
      href,
      title: chapterTitle(xml) ?? item.href,
      text,
      xhtml: sanitized,
    });
  }

  return {
    format: 'epub',
    container,
    metadata: {
      title: book.meta.title ?? path.basename(epubPath, '.epub'),
      author: book.meta.author ?? null,
      language: book.meta.language ?? null,
      identifier: book.meta.identifier ?? null,
    },
    book,
    toc,
    chapters,
  };
}

/**
 * Sanitized chapter XHTML body (M6 §11-15): runs through the same DOMPurify
 * policy as articles; the renderer may insert this safely (CSP + sanitizer).
 */
export async function chapterSanitizedXhtml(container, href) {
  // container.readEntryText resolves opfDir-relative hrefs itself
  const xml = await container.readEntryText(href);
  if (xml === null) return null;
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(xml);
  const body = bodyMatch ? bodyMatch[1] : xml;
  return sanitizeArticleHtml(body);
}

/**
 * Canonical whole-book text: chapter texts concatenated with NO separator —
 * exactly what the renderer produces by stacking chapter sections in one
 * container, so annotation offsets agree on both sides (M6 §33).
 */
export function bookCanonicalText(session) {
  return session.chapters.map((c) => c.text).join('');
}

/**
 * Whole-book searchable text: array of { href, title, text } (chapter order).
 * Global search indexes this per chapter (M6 §28: EPUB Search 协同 M3).
 */
export function chapterTexts(session) {
  return session.chapters.map((c) => ({ href: c.href, title: c.title, text: c.text }));
}

/** Find which chapter index contains a CFI fragment href (M6 §33 locator aid). */
export function chapterForHref(session, href) {
  return session.chapters.findIndex((c) => c.href === href || c.href.endsWith(href));
}
