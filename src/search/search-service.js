/**
 * SearchService (M3 §18/§31/§69): in-memory full-text search over a
 * rebuildable JSON index. Decision recorded in M3-STATUS: the project has no
 * SQLite (M0 drift, accepted); per M3 §31 we keep the existing architecture —
 * substring matching (no tokenizer) handles CJK via contiguous matching and
 * is benchmarked in spikes/bench-m3.mjs + docs/PERF.md.
 *
 * Search scope (§18-20): title / author / body(canonical article text) /
 * highlights / notes / tags / URL. NEVER source/page.html, assets, caches.
 * Orphaned annotations stay searchable (§126/127).
 *
 * The derived index lives in REVERIE_HOME (never inside the user library)
 * and is fully rebuildable from library files.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../core/atomic-write.js';
import { scanLibrary } from '../library/scan.js';
import { loadUserState, stateOf } from '../library/user-state.js';
import { parseMarkdownBlocks } from '../reader/markdown-reader.js';
import { parseSearchQuery } from './query-parser.js';
import { getReverieHome } from '../core/paths.js';

export const SEARCH_INDEX_VERSION = 1;
const BODY_INDEX_LIMIT = 200 * 1024; // index at most the first 200 KB of body

export function searchIndexPath() {
  return process.env.REVERIE_SEARCH_INDEX ?? path.join(getReverieHome(), 'search-index.json');
}

const FIELD_PRIORITY = Object.freeze({
  title: 100, author: 80, tag: 60, highlight: 52, note: 50, body: 30, url: 20,
});

const STAMP_FILES = ['article.md', 'annotations.jsonl', 'meta.json'];
/** Change fingerprint over every indexed source file (M3 §34). */
async function stampFor(docDir) {
  try {
    const parts = await Promise.all(STAMP_FILES.map(async (f) => {
      try {
        const st = await fsp.stat(path.join(docDir, f));
        return `${st.mtimeMs}:${st.size}`;
      } catch {
        return 'absent';
      }
    }));
    return parts.join('|');
  } catch {
    return null;
  }
}

let cachedIndex = null;

/** Load (and lazily build) the search index. */
export async function loadSearchIndex(libraryRoot) {
  if (cachedIndex) return cachedIndex;
  try {
    const raw = JSON.parse(await fsp.readFile(searchIndexPath(), 'utf8'));
    if (raw?.index_version === SEARCH_INDEX_VERSION && Array.isArray(raw.documents)) {
      cachedIndex = raw;
      return cachedIndex;
    }
  } catch { /* missing/torn -> build */ }
  return rebuildSearchIndex(libraryRoot, searchIndexPath());
}

/** Build the full index from library files (atomic replace; M3 §63/64). */
export async function rebuildSearchIndex(libraryRoot, indexPath = searchIndexPath()) {
  const userState = await loadUserState();
  const { entries } = await scanLibrary(libraryRoot);
  const documents = [];
  for (const entry of entries) {
    const doc = await buildSearchableDocument(libraryRoot, entry, userState);
    if (doc) documents.push(doc);
  }
  documents.sort((a, b) => a.document_id.localeCompare(b.document_id));
  const index = {
    index_version: SEARCH_INDEX_VERSION,
    built_at: new Date().toISOString(),
    documents,
  };
  await writeFileAtomic(indexPath, JSON.stringify(index));
  cachedIndex = index;
  return index;
}

/** Build one SearchableDocument (M3 §68) from scanner entry + article.md. */
export async function buildSearchableDocument(libraryRoot, entry, userState) {
  try {
    const docDir = path.join(libraryRoot, entry.dir);
    const stamp = await stampFor(docDir);
    let body = '';
    try {
      if (entry.book_body) {
        // type=book: scan extracted chapter text from book.epub
        body = entry.book_body;
      } else {
        const raw = await fsp.readFile(path.join(docDir, 'article.md'), 'utf8');
        body = parseMarkdownBlocks(raw).canonicalText.slice(0, BODY_INDEX_LIMIT);
      }
    } catch { /* body unavailable -> metadata-only document, still searchable */ }
    const state = stateOf(userState, entry.document_id);
    return {
      document_id: entry.document_id,
      path: entry.dir,
      type: entry.type,
      title: entry.title ?? '',
      author: entry.author ?? '',
      url: entry.canonical_url ?? entry.original_url ?? '',
      tags: state.tags,
      read: state.read,
      favorite: state.favorite,
      inbox: state.inbox,
      last_opened_at: state.last_opened_at,
      captured_at: entry.captured_at ?? entry.created_at ?? null,
      content_hash: entry.content_hash,
      source_type: entry.source_type ?? null,
      import_key: entry.import_key ?? null,
      feed_id: entry.feed_id ?? null,
      feed_title: entry.feed_title ?? null,
      external_id: entry.external_id ?? null,
      body,
      annotations: (entry.annotations ?? []).map((a) => ({
        annotation_id: a.annotation_id,
        type: a.type,
        status: a.status,
        quoted_text: a.selected_text ?? '',
        note: a.note ?? '',
        position: a.position ?? null,
      })),
      file: { stamp },
    };
  } catch (err) {
    // one broken document never takes down the index (M3 §101)
    console.error(`[search] failed to index ${entry.dir}: ${err.message}`);
    return null;
  }
}

/** Incremental refresh: re-stat files, reindex changed, drop deleted (M3 §34). */
export async function refreshSearchIndex(libraryRoot) {
  const index = await loadSearchIndex(libraryRoot);
  const userState = await loadUserState();
  const { entries } = await scanLibrary(libraryRoot);
  const byId = new Map(index.documents.map((d) => [d.document_id, d]));
  const seen = new Set();
  let dirty = false;

  for (const entry of entries) {
    seen.add(entry.document_id);
    // change detection covers every indexed source file (M3 §34): body,
    // annotations and metadata — a change in any of them forces reindex
    const docDir = path.join(libraryRoot, entry.dir);
    const stamp = await stampFor(docDir);
    const existing = byId.get(entry.document_id);
    const unchanged = existing && stamp !== null && existing.file?.stamp === stamp;
    if (unchanged) {
      // user-state can still change — refresh cheap fields
      const state = stateOf(userState, entry.document_id);
      Object.assign(existing, {
        title: entry.title ?? existing.title,
        author: entry.author ?? '',
        tags: state.tags,
        read: state.read,
        favorite: state.favorite,
        inbox: state.inbox,
        last_opened_at: state.last_opened_at,
      });
      continue;
    }
    const doc = await buildSearchableDocument(libraryRoot, entry, userState);
    if (doc) {
      doc.file.stamp = stamp;
      const i = index.documents.findIndex((d) => d.document_id === doc.document_id);
      if (i >= 0) index.documents[i] = doc;
      else index.documents.push(doc);
      dirty = true;
    }
  }
  // deletions: a removed document must leave no ghost results (M3 §35)
  const kept = index.documents.filter((d) => {
    if (seen.has(d.document_id)) return true;
    dirty = true;
    return false;
  });
  if (kept.length !== index.documents.length) index.documents = kept;
  index.built_at = new Date().toISOString();
  if (dirty) await writeFileAtomic(searchIndexPath(), JSON.stringify(index));
  cachedIndex = index;
  return { total: index.documents.length, dirty };
}

/** Mark the cached index dirty so the next load refreshes from files. */
export function invalidateSearchIndex() {
  cachedIndex = null;
}

// ---------- query execution ----------

const CONTEXT = 48;
const snippetAround = (text, rawTerm) => {
  const lower = text.toLowerCase();
  const lowerTerm = rawTerm.toLowerCase();
  const idx = lower.indexOf(lowerTerm);
  if (idx === -1) return null;
  const from = Math.max(0, idx - CONTEXT);
  const to = Math.min(text.length, idx + lowerTerm.length + CONTEXT);
  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
};

const matchField = (fieldText, term) => {
  if (!fieldText) return null;
  const idx = fieldText.toLowerCase().indexOf(term.toLowerCase());
  return idx === -1 ? null : idx;
};

function matchesForDoc(doc, q) {
  const matches = [];
  const hit = (type, text, term, extra = {}) => {
    const snippet = snippetAround(text, term);
    if (snippet === null) return false;
    matches.push({ type, snippet, term, ...extra });
    if (process.env.DBG) console.error("[hit] pushed", type, "len:", matches.length);
    return true;
  };

  for (const term of q.terms) {
    let any = false;
    if (matchField(doc.title, term) !== null) { hit('title', doc.title, term); any = true; }
    if (matchField(doc.author, term) !== null) { hit('author', doc.author, term); any = true; }
    if (doc.tags.some((t) => t.toLowerCase().includes(term.toLowerCase()))) {
      hit('tag', doc.tags.join(' '), term); any = true;
    }
    for (const a of doc.annotations) {
      // annotation hits count toward the AND gate (M3 §21) — a term that only
      // lives in a highlight/note must still satisfy the query
      if (matchField(a.quoted_text, term) !== null) { hit('highlight', a.quoted_text, term, { annotation_id: a.annotation_id, annotation_status: a.status }); any = true; }
      if (matchField(a.note, term) !== null) { hit('note', a.note, term, { annotation_id: a.annotation_id, annotation_status: a.status }); any = true; }
    }
    if (matchField(doc.body, term) !== null) { hit('body', doc.body, term); any = true; }
    if (matchField(doc.url, term) !== null) { hit('url', doc.url, term); any = true; }
    if (!any) return null; // AND semantics: every term must match somewhere
  }
  for (const phrase of q.phrases) {
    if (matchField(doc.body, phrase) === null && matchField(doc.title, phrase) === null) return null;
  }
  if (process.env.DBG) console.error("[mfd] return len", matches.length);
  return matches;
}

const matchesFilters = (doc, q) => {
  if (q.read !== null && doc.read !== q.read) return false;
  if (q.favorite !== null && doc.favorite !== q.favorite) return false;
  if (q.inbox !== null && doc.inbox !== q.inbox) return false;
  if (q.author && !(doc.author ?? '').toLowerCase().includes(q.author.toLowerCase())) return false;
  for (const tag of q.tags) {
    if (!doc.tags.some((t) => t.toLowerCase() === tag)) return false; // tag AND (M3 §51)
  }
  return true;
};

const scoreOf = (matches) => matches.reduce((sum, m) => sum + (FIELD_PRIORITY[m.type] ?? 0), 0);

/**
 * Search. Returns { error?, total, results } — one card per document with
 * ranked match contexts (M3 §22/§47/§55).
 */
export async function search(rawQuery, { limit = 50, offset = 0, libraryRoot } = {}) {
  const q = parseSearchQuery(rawQuery);
  if (q.error) return { error: q.error, total: 0, results: [] };
  const index = cachedIndex ?? (libraryRoot ? await loadSearchIndex(libraryRoot) : null);
  const results = [];
  for (const doc of index?.documents ?? []) {
    if (!matchesFilters(doc, q)) continue;
    const matches = matchesForDoc(doc, q);
    if (matches === null) continue;
    results.push({
      document_id: doc.document_id,
      title: doc.title,
      author: doc.author,
      captured_at: doc.captured_at,
      read: doc.read,
      favorite: doc.favorite,
      inbox: doc.inbox,
      tags: doc.tags,
      matches: [...matches].sort((a, b) => FIELD_PRIORITY[b.type] - FIELD_PRIORITY[a.type]),
      score: scoreOf(matches),
    });
  }
  results.sort((a, b) => b.score - a.score || a.document_id.localeCompare(b.document_id));
  return { total: results.length, results: results.slice(offset, offset + limit) };
}

/**
 * Library query (M3 §41-§53): the ONE composable path behind every view.
 * views: all | inbox | favorites | unread | recent
 * sort: captured (default) | recent-opened | title
 */
export async function queryLibrary(rawQuery, {
  view = 'all',
  tags = [],
  sort = 'captured',
  limit = 200,
  offset = 0,
  libraryRoot,
} = {}) {
  const index = cachedIndex ?? (libraryRoot ? await loadSearchIndex(libraryRoot) : null);
  const q = parseSearchQuery(rawQuery ?? '');
  let docs = (index?.documents ?? []).slice();

  // view filters are composable predicates (M3 §49), never if/else chains
  const predicates = {
    all: () => true,
    inbox: (d) => d.inbox,
    favorites: (d) => d.favorite,
    unread: (d) => !d.read,
    recent: (d) => Boolean(d.last_opened_at),
  };
  const predicate = predicates[view] ?? (() => true);
  docs = docs.filter((d) => predicate(d) && matchesFilters(d, q));
  for (const tag of tags) {
    docs = docs.filter((d) => d.tags.some((t) => t.toLowerCase() === tag.toLowerCase()));
  }

  const sorters = {
    'recent-opened': (a, b) => (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? '') || a.document_id.localeCompare(b.document_id),
    captured: (a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? '') || a.document_id.localeCompare(b.document_id),
    title: (a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN') || a.document_id.localeCompare(b.document_id),
  };
  docs.sort(sorters[sort] ?? sorters.captured);

  return {
    total: docs.length,
    results: docs.slice(offset, offset + limit).map((d) => ({
      document_id: d.document_id,
      title: d.title,
      author: d.author,
      captured_at: d.captured_at,
      last_opened_at: d.last_opened_at,
      read: d.read,
      favorite: d.favorite,
      inbox: d.inbox,
      tags: d.tags,
      path: d.path,
    })),
  };
}

/** Tag facet counts (derived statistics, never a source of truth — M3 §90/91). */
export function tagFacets() {
  const counts = new Map();
  for (const doc of cachedIndex?.documents ?? []) {
    for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
}

/** View counters (Inbox N / Unread N / Favorites N) — computed, not stored (M3 §91). */
export function viewCounts() {
  const docs = cachedIndex?.documents ?? [];
  return {
    all: docs.length,
    inbox: docs.filter((d) => d.inbox).length,
    favorites: docs.filter((d) => d.favorite).length,
    unread: docs.filter((d) => !d.read).length,
  };
}
