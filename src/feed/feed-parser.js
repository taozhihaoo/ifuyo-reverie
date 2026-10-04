/**
 * FeedParser (M4 §24-33): RSS 2.0 + Atom 1.0 -> NormalizedFeed.
 *
 * - XML parsing reuses jsdom (already a project dependency) in XML mode —
 *   recorded in DECISIONS.md instead of adding a new parser dependency.
 * - Defense-in-depth (M4 §59): any XML containing a DOCTYPE is rejected
 *   outright (XXE / billion-laughs vectors); jsdom does not fetch external
 *   entities but we do not rely on that alone.
 * - Output is our domain model, never a DOM/XML library object (M4 §24).
 * - Malformed XML / wrong root -> FeedParseError, never a crash (M4 §60-61).
 */
import { JSDOM } from 'jsdom';

export class FeedParseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // PARSE_ERROR | UNSUPPORTED_FORMAT | UNSUPPORTED_DOCTYPE | EMPTY_FEED
  }
}

const MAX_TEXT_FIELD = 512 * 1024; // single field cap (M4 §59 huge text node)

const textOf = (el) => (el ? (el.textContent ?? '').trim().slice(0, MAX_TEXT_FIELD) : '');

function childText(parent, tagName) {
  // literal-name lookup: jsdom XML mode preserves namespaced names as written
  const els = parent.getElementsByTagName(tagName);
  return textOf(els[0]);
}

function allChild(parent, tagName) {
  return [...parent.getElementsByTagName(tagName)];
}

/** Normalize RSS (RFC 822) and Atom (ISO 8601) dates -> ISO UTC or null. */
export function normalizeDate(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const t = Date.parse(raw.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Strip "email (Name)" down to the display name (RSS author convention). */
export function normalizeAuthor(raw) {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = /^\S+@\S+\s+\((.+)\)$/.exec(s);
  return (m ? m[1] : s).slice(0, 256);
}

const FALLBACK_TITLE = '(无标题条目)';

function detectRoot(xml) {
  if (/<!DOCTYPE/i.test(xml.slice(0, 4096))) {
    throw new FeedParseError('UNSUPPORTED_DOCTYPE', 'feed 包含 DOCTYPE 声明，出于安全考虑拒绝解析');
  }
  let dom;
  try {
    dom = new JSDOM(xml, { contentType: 'application/xml' });
  } catch (err) {
    throw new FeedParseError('PARSE_ERROR', `XML 解析失败: ${err.message}`);
  }
  const doc = dom.window.document;
  const root = doc.documentElement;
  if (!root) throw new FeedParseError('PARSE_ERROR', 'XML 没有根元素');
  if (root.tagName === 'rss') return { format: 'rss', root: root.getElementsByTagName('channel')[0] ?? null, doc };
  if (root.tagName === 'feed') return { format: 'atom', root, doc };
  throw new FeedParseError('UNSUPPORTED_FORMAT', `无法识别的 Feed 格式: <${root.tagName}>`);
}

function parseRssItem(item) {
  const guidEl = item.getElementsByTagName('guid')[0];
  const guid = textOf(guidEl);
  const isPermaLink = guidEl?.getAttribute?.('isPermaLink') !== 'false'; // RSS default true
  const link = childText(item, 'link');
  const contentEncoded = childText(item, 'content:encoded');
  const description = childText(item, 'description');
  const hasContent = contentEncoded.length > 0;
  return {
    external_id: guid || null,
    external_id_type: guid ? (isPermaLink ? 'guid-permalink' : 'guid') : null,
    title: childText(item, 'title') || link || FALLBACK_TITLE,
    author: normalizeAuthor(childText(item, 'author')) ?? normalizeAuthor(childText(item, 'dc:creator')),
    link: link || (guid && isPermaLink ? guid : null),
    published_at: normalizeDate(childText(item, 'pubDate')),
    updated_at: null,
    summary: description || null,
    content: hasContent ? contentEncoded : (description || null),
    content_type: 'html',
    content_is_full: hasContent, // description alone = summary-only (M4 §18)
    categories: allChild(item, 'category').map((c) => textOf(c)).filter(Boolean),
  };
}

function atomLink(entry, rel) {
  const links = allChild(entry, 'link');
  const relMatch = links.filter((l) => (l.getAttribute('rel') ?? 'alternate') === rel);
  const chosen = relMatch[0] ?? links.find((l) => !l.getAttribute('rel')) ?? null;
  return chosen?.getAttribute('href') ?? null;
}

function parseAtomEntry(entry, feedAuthor) {
  const id = childText(entry, 'id');
  const contentEl = entry.getElementsByTagName('content')[0] ?? null;
  const contentType = contentEl?.getAttribute?.('type') ?? 'text';
  let content = contentEl ? textOf(contentEl) : null; // html type: escaped markup, textContent decodes it
  const contentIsHtml = contentEl ? contentType.includes('html') || /<[a-z][\s\S]*>/i.test(content) : false;
  const summary = childText(entry, 'summary');
  const authors = allChild(entry, 'author').map((a) => childText(a, 'name')).filter(Boolean);
  return {
    external_id: id || null,
    external_id_type: id ? 'atom-id' : null,
    title: childText(entry, 'title') || atomLink(entry, 'alternate') || FALLBACK_TITLE,
    author: normalizeAuthor(authors[0] ?? feedAuthor),
    link: atomLink(entry, 'alternate') ?? atomLink(entry, null),
    published_at: normalizeDate(childText(entry, 'published')) ?? normalizeDate(childText(entry, 'updated')),
    updated_at: normalizeDate(childText(entry, 'updated')),
    summary: summary || null,
    content: content || summary || null,
    content_type: content && contentIsHtml ? 'html' : 'text',
    content_is_full: Boolean(content),
    categories: allChild(entry, 'category').map((c) => c.getAttribute('term') ?? textOf(c)).filter(Boolean),
  };
}

/**
 * Parse RSS 2.0 / Atom 1.0 XML into a NormalizedFeed.
 * items are sorted newest-first by published/updated (M4 §76).
 */
export function parseFeed(xml, { sourceUrl = null } = {}) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new FeedParseError('PARSE_ERROR', 'feed 内容为空');
  }
  const { format, root, doc } = detectRoot(xml);
  if (!root) throw new FeedParseError('PARSE_ERROR', format === 'rss' ? '缺少 <channel>' : '缺少 <feed> 根内容');

  let meta;
  let rawItems;
  if (format === 'rss') {
    meta = {
      title: childText(root, 'title') || sourceUrl || '未命名订阅',
      site_url: childText(root, 'link') || null,
      description: childText(root, 'description') || null,
      language: childText(root, 'language') || null,
      image_url: root.getElementsByTagName('image')[0]
        ? childText(root.getElementsByTagName('image')[0], 'url')
        : null,
    };
    rawItems = allChild(root, 'item');
  } else {
    meta = {
      title: childText(root, 'title') || sourceUrl || '未命名订阅',
      site_url: atomLink(root, 'alternate') ?? atomLink(root, null),
      description: childText(root, 'subtitle') || null,
      language: null,
      image_url: null,
    };
    rawItems = allChild(root, 'entry');
  }

  const feedAuthor = format === 'atom' ? childText(root, 'author').slice(0, 256) || null : null;
  const items = rawItems.map((raw) => (format === 'rss' ? parseRssItem(raw) : parseAtomEntry(raw, feedAuthor)));
  items.sort((a, b) => (b.published_at ?? b.updated_at ?? '').localeCompare(a.published_at ?? a.updated_at ?? ''));

  if (items.length === 0 && !meta.title) {
    throw new FeedParseError('EMPTY_FEED', 'feed 中没有任何可识别内容');
  }

  return {
    format,
    source_url: sourceUrl,
    title: meta.title,
    site_url: meta.site_url,
    description: meta.description,
    language: meta.language,
    image_url: meta.image_url,
    items,
  };
}
