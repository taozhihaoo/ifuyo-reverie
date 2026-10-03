/**
 * Search query parser (M3 §25-27).
 *
 * Grammar (whitespace-separated tokens):
 *   bare word          -> full-text term (AND across terms)
 *   "quoted phrase"    -> exact phrase term
 *   tag:rust           -> tag filter (canonical key compare; multiple = AND)
 *   is:read | is:unread | is:favorite | is:inbox
 *   author:xxx         -> author substring filter
 *
 * Unknown/empty filters produce a friendly parse error — never an exception.
 */
const FILTERS = new Set(['tag', 'is', 'author', 'in']);
const READ_FLAGS = new Set(['is:read', 'is:unread', 'is:favorite', 'is:inbox']);

export function parseSearchQuery(raw) {
  const out = {
    terms: [],       // AND-ed full-text terms (substring semantics)
    phrases: [],     // AND-ed exact phrases (whitespace preserved)
    tags: [],        // canonical tag keys (AND)
    author: null,    // substring, first author: wins (later duplicates AND too — keep simple: intersect)
    read: null,      // true | false | null
    favorite: null,
    inbox: null,
    error: null,
  };
  if (typeof raw !== 'string') return { ...out, error: '查询必须是文本' };

  const tokens = raw.match(/"[^"]*"|\S+/g) ?? [];
  const authors = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const colon = token.indexOf(':');
    const prefix = colon > 0 ? lower.slice(0, colon) : null;
    const value = colon > 0 ? token.slice(colon + 1) : null;

    if (prefix && FILTERS.has(prefix)) {
      if (value === '' || value === '""') {
        return { ...out, error: `过滤条件 "${prefix}:" 后面缺少内容` };
      }
      if (prefix === 'tag') { out.tags.push(value.toLowerCase()); continue; }
      if (prefix === 'author') { authors.push(value); continue; }
      if (prefix === 'is') {
        if (lower === 'is:read') { out.read = true; continue; }
        if (lower === 'is:unread') { out.read = false; continue; }
        if (lower === 'is:favorite') { out.favorite = true; continue; }
        if (lower === 'is:inbox') { out.inbox = true; continue; }
        return { ...out, error: `未知的过滤条件 "${token}"（可用：is:read / is:unread / is:favorite / is:inbox）` };
      }
      if (prefix === 'in') {
        if (lower === 'in:inbox') { out.inbox = true; continue; }
        return { ...out, error: `未知的过滤条件 "${token}"（可用：in:inbox）` };
      }
    }

    if (READ_FLAGS.has(lower)) { // tolerate missing-colon typos in a friendly way
      return { ...out, error: `过滤条件需要冒号："${token}" 应写作 "${token.slice(0, 2)}:${token.slice(2)}"？` };
    }

    if (token.startsWith('"')) {
      if (token.length < 3 || !token.endsWith('"')) {
        return { ...out, error: '引号不闭合，请补全成对的双引号' };
      }
      out.phrases.push(token.slice(1, -1));
      continue;
    }
    out.terms.push(token);
  }
  if (authors.length > 0) out.author = authors.join(' ');
  return out;
}
