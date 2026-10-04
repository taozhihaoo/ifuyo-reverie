/**
 * External import sources (M5 §12-19): Pocket / Wallabag / Raindrop export
 * files -> NormalizedImportRecord[].
 *
 * Real Sample First (M5 §116): no real export files were available in this
 * environment, so fixtures are 人工构造 (clearly marked synthetic) following
 * the officially documented export shapes. Field access is defensive:
 * unknown fields are ignored, wrong types never crash the import (M5 §74).
 * External types never leak past this module (M5 §111).
 */

export const IMPORT_SOURCES = ['pocket', 'wallabag', 'raindrop'];

export class ImportParseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // UNSUPPORTED_FORMAT | PARSE_ERROR
  }
}

/** Detect which supported source a parsed JSON payload looks like. */
export function detectFormat(parsedJson, fileName = '') {
  const lower = fileName.toLowerCase();
  // Pocket official export: { status, list: { "<item_id>": {...} } }
  if (parsedJson && typeof parsedJson.list === 'object' && parsedJson.list !== null && !Array.isArray(parsedJson.list)) return 'pocket';
  // Bare arrays are ambiguous (Raindrop bookmarks vs Wallabag entries):
  // discriminate by entry fields — wallabag entries carry is_archived/is_starred/uuid.
  if (Array.isArray(parsedJson)) {
    if (parsedJson.length === 0) return 'raindrop'; // empty raindrop export
    const first = parsedJson[0];
    if (first && (first.is_archived !== undefined || first.is_starred !== undefined || first.uuid !== undefined)) return 'wallabag';
    return 'raindrop';
  }
  if (parsedJson && Array.isArray(parsedJson.items)) return 'raindrop';
  // Wallabag official export: array of entries / { entries: [...] } / { _embedded: { items } }
  if (parsedJson && (Array.isArray(parsedJson.entries) || Array.isArray(parsedJson._embedded?.items))) return 'wallabag';
  if (lower.includes('pocket')) return 'pocket';
  if (lower.includes('raindrop')) return 'raindrop';
  if (lower.includes('wallabag')) return 'wallabag';
  return null;
}

const safeStr = (v) => (typeof v === 'string' ? v : null);
const safeNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const safeTags = (v) => (Array.isArray(v) ? v.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean) : []);

function toIso(v) {
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000; // seconds vs ms
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const stripHtml = (html) => {
  if (typeof html !== 'string' || !html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
};

const rec = (base) => ({
  external_id: base.external_id ?? null,
  title: base.title ?? null,
  author: base.author ?? null,
  url: base.url ?? null,
  excerpt: base.excerpt ?? null,        // plain text
  content_html: base.content_html ?? null, // sanitized later by the pipeline
  tags: base.tags ?? [],
  read: base.read ?? false,
  favorite: base.favorite ?? false,
  archived: base.archived ?? false,
  created_at: base.created_at ?? null,
  published_at: base.published_at ?? null,
  collection: base.collection ?? null,
  note: base.note ?? null,
});

/** Pocket: { status, list: { "<item_id>": {...} } }. status 1 = archived(read). */
export function normalizePocket(json) {
  const list = json?.list;
  if (!list || typeof list !== 'object' || Array.isArray(list)) {
    throw new ImportParseError('PARSE_ERROR', 'Pocket 导出缺少 list 字段');
  }
  const out = [];
  for (const [itemId, e] of Object.entries(list)) {
    if (!e || typeof e !== 'object') continue;
    // pocket authors: { "<id>": { id, name } } — take first name
    const authorName = e.authors && typeof e.authors === 'object'
      ? Object.values(e.authors).map((a) => safeStr(a?.name)).find(Boolean) ?? null
      : null;
    out.push(rec({
      external_id: safeStr(e.item_id) ?? safeStr(itemId),
      title: safeStr(e.resolved_title) ?? safeStr(e.given_title) ?? (stripHtml(safeStr(e.excerpt)) || null),
      author: authorName,
      url: safeStr(e.resolved_url) ?? safeStr(e.given_url),
      excerpt: stripHtml(safeStr(e.excerpt)) || null,
      content_html: safeStr(e.resolved_content),
      tags: e.tags && typeof e.tags === 'object'
        ? Object.values(e.tags).map((t) => safeStr(t?.tag)).filter(Boolean)
        : [],
      read: safeNum(e.status) === 1,
      archived: safeNum(e.status) === 1,
      favorite: safeNum(e.favorite) === 1,
      created_at: toIso(safeNum(e.time_added)),
      published_at: toIso(safeNum(e.time_published)),
    }));
  }
  return out;
}

/** Wallabag: array of entries / { entries } / { _embedded: { items } }. is_archived=1 → read. */
export function normalizeWallabag(json) {
  const entries = Array.isArray(json) ? json : json?.entries ?? json?._embedded?.items ?? null;
  if (!Array.isArray(entries)) throw new ImportParseError('PARSE_ERROR', 'Wallabag 导出缺少条目数组');
  return entries.filter((e) => e && typeof e === 'object').map((e) => {
    const publishedBy = Array.isArray(e.published_by) ? e.published_by.find(Boolean) : safeStr(e.published_by);
    return rec({
      external_id: safeStr(e.uuid) ?? (safeNum(e.id) !== null ? String(e.id) : null),
      title: safeStr(e.title),
      author: publishedBy,
      url: safeStr(e.url),
      excerpt: stripHtml(safeStr(e.content)).slice(0, 300) || null,
      content_html: safeStr(e.content),
      tags: safeTags(e.tags),
      read: e.is_archived === 1 || e.is_archived === true,
      favorite: e.is_starred === 1 || e.is_starred === true,
      created_at: toIso(safeStr(e.created_at)),
      published_at: toIso(safeStr(e.published_at)),
    });
  });
}

/** Raindrop: array of bookmarks / { items }. Raindrop has no read concept. */
export function normalizeRaindrop(json) {
  const items = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : null;
  if (!Array.isArray(items)) throw new ImportParseError('PARSE_ERROR', 'Raindrop 导出缺少 items 数组');
  return items.filter((e) => e && typeof e === 'object').map((e) => rec({
    external_id: safeStr(e._id) ?? (safeNum(e.id) !== null ? String(e.id) : null),
    title: safeStr(e.title),
    author: safeStr(e.creator),
    url: safeStr(e.link),
    excerpt: stripHtml(safeStr(e.excerpt)) || null,
    tags: safeTags(e.tags),
    favorite: e.important === true,
    created_at: toIso(safeStr(e.created)),
    published_at: toIso(safeStr(e.lastUpdate)),
    collection: safeStr(e.collection?.title),
    note: safeStr(e.note),
  }));
}

export function normalizeSource(format, json) {
  switch (format) {
    case 'pocket': return normalizePocket(json);
    case 'wallabag': return normalizeWallabag(json);
    case 'raindrop': return normalizeRaindrop(json);
    default: throw new ImportParseError('UNSUPPORTED_FORMAT', '无法识别的导入格式 — 支持 Pocket / Wallabag / Raindrop 导出文件');
  }
}
