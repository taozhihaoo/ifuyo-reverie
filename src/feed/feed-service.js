/**
 * FeedService (M4 §130): the orchestrator behind every feed operation.
 * Fetch -> Parse -> Normalize -> Deduplicate -> Ingest -> (index refresh is
 * the caller's job). Per-refresh FeedRefreshResult uses typed status/errors.
 *
 * Update strategy (M4 §40/§44/§78): same feed+identity with changed content
 * -> atomic article.md rewrite + meta refresh; user state (read/favorite/
 * inbox/tags) and annotations (M2 files) are NEVER touched by a refresh.
 * Refresh is idempotent (§115): unchanged items are skipped, not duplicated.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { ERROR_CODES } from '../capture/protocol.js';
import { FetchError, fetchUrl, FETCH_LIMITS } from '../capture/fetch.js';
import { decodeBody } from '../capture/fetch.js';
import { parseFeed, FeedParseError } from './feed-parser.js';
import { addFeed as addFeedStored, loadFeeds, updateFeed, displayTitle } from './feed-store.js';
import { loadSearchIndex, invalidateSearchIndex, refreshSearchIndex } from '../search/search-service.js';
import { sanitizeArticleHtml } from '../security/sanitize-html.js';
import { htmlToMarkdown } from '../article/markdown.js';
import { writeFileAtomic } from '../core/atomic-write.js';
import { writeMeta } from '../core/meta.js';
import { newId } from '../core/ids.js';
import { pLimit } from '../core/p-limit.js';
import { loadUserState, stateOf } from '../library/user-state.js';
import { canonicalizeForDedupe } from '../capture/pipeline.js';

export const FEED_LIMITS = Object.freeze({
  ...FETCH_LIMITS,
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 20_000,
});
const MAX_RETRIES = 2;
const REFRESH_CONCURRENCY = 4;

const refreshing = new Set(); // feed_ids currently refreshing (M4 §116)

const sha256hex = (s) => 'sha256-' + createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

export class FeedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Fetch + parse one feed URL. Used by Add Feed (M4 §88) and refresh. */
export async function fetchAndParse(url, { etag = null, lastModified = null, fetchImpl = fetchUrl } = {}) {
  const headers = {};
  if (etag) headers['if-none-match'] = etag;
  if (lastModified) headers['if-modified-since'] = lastModified;
  let res;
  try {
    res = await fetchImpl(url, { headers, limits: FEED_LIMITS });
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(ERROR_CODES.NETWORK_ERROR, err.message);
  }
  if (res.notModified) return { notModified: true, etag: res.etag, lastModified: res.lastModified };
  if (!/xml|text/i.test(res.contentType ?? '')) {
    throw new FeedParseError('PARSE_ERROR', `unsupported content-type: ${res.contentType || '(none)'}`);
  }
  const xml = decodeBody(res.buffer, res.contentType);
  const parsed = parseFeed(xml, { sourceUrl: res.finalUrl });
  return { notModified: false, parsed, finalUrl: res.finalUrl, etag: res.etag, lastModified: res.lastModified };
}

/**
 * Add a feed subscription: validate (fetch+parse) FIRST, persist only on
 * success (M4 §88/89), then run an initial refresh so items land in Library.
 */
export async function addFeedUrl(libraryRoot, rawUrl, deps = {}) {
  const { fetchAndParseImpl = fetchAndParse } = deps;
  const outcome = await fetchAndParseImpl(rawUrl, deps);
  if (outcome.notModified) throw new FeedError('NETWORK_ERROR', 'server returned 304 for a feed we do not have yet');
  const { duplicate, feed } = await addFeedStored(libraryRoot, {
    originalUrl: rawUrl,
    canonicalUrl: outcome.finalUrl,
    parse: outcome.parsed,
  });
  if (duplicate) return { duplicate: true, feed };
  const refresh = await refreshFeed(libraryRoot, feed.feed_id, { ...deps, parsed: outcome });
  return { duplicate: false, feed, refresh };
}

/** Build the dedup identity key for a feed item (M4 §36-38). */
function itemIdentity(feedId, item) {
  if (item.external_id) return { kind: 'external-id', key: `${feedId}::${item.external_id}` };
  if (item.link) return { kind: 'canonical-url', key: `${feedId}::${canonicalizeForDedupe(item.link)}` };
  return { kind: 'content-hash', key: `${feedId}::${sha256hex((item.title ?? '') + (item.content ?? ''))}` };
}

function existingFeedDocs(index, feedId) {
  // external ids are feed-scoped (guids are only unique within a feed);
  // canonical links are treated as globally unique so a deleted+re-added
  // subscription re-links to its existing articles (M4 §50)
  const sameFeed = index.documents.filter((d) => d.feed_id === feedId);
  const feedDocs = index.documents.filter((d) => d.source_type === 'feed');
  const byExternal = new Map();
  const byLink = new Map();
  for (const d of sameFeed) {
    if (d.external_id) byExternal.set(`${feedId}::${d.external_id}`, d);
  }
  for (const d of feedDocs) {
    if (d.url) byLink.set(`${feedId}::${canonicalizeForDedupe(d.url)}`, d);
  }
  return { docs: sameFeed, byExternal, byLink };
}

/** Sanitize + convert one item's content to markdown. */
async function itemToMarkdown(item) {
  if (item.content_type === 'html' && item.content) {
    const clean = await sanitizeArticleHtml(item.content);
    return htmlToMarkdown(clean);
  }
  if (item.content) return item.content.replace(/\r\n/g, '\n').trim() + '\n';
  return '';
}

/** Create or update the Document for one normalized item. */
async function ingestItem({ libraryRoot, feed, item, existingDoc }) {
  if (process.env.DBG) console.error("[ing]", JSON.stringify(item.title), "existing:", existingDoc ? existingDoc.document_id.slice(-4) : "null");
  const markdown = await itemToMarkdown(item);
  const contentHash = sha256hex(markdown);
  const now = new Date().toISOString();

  if (existingDoc) {
    if (existingDoc.content_hash === contentHash) {
      return { action: 'unchanged', document_id: existingDoc.document_id };
    }
    // content changed: atomic rewrite of article.md + meta refresh only
    const docDir = path.join(libraryRoot, existingDoc.path);
    await writeFileAtomic(path.join(docDir, 'article.md'), markdown);
    const meta = JSON.parse(await fsp.readFile(path.join(docDir, 'meta.json'), 'utf8'));
    meta.title = item.title || meta.title;
    if (item.author) meta.author = item.author;
    if (item.published_at) meta.published_at = item.published_at;
    meta.updated_at = now;
    meta.source.content_hash = contentHash;
    if (item.content_is_full === false) meta.content_provenance = 'feed-summary';
    else meta.content_provenance = 'feed-content';
    await writeFileAtomic(path.join(docDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    return { action: 'updated', document_id: existingDoc.document_id, contentHash };
  }

  // new document (M1 file layout, type=article reused per M4 §14)
  const documentId = newId();
  const docDir = path.join(libraryRoot, 'articles', String(now.slice(0, 4)), documentId);
  const meta = {
    format_version: 1,
    document_id: documentId,
    type: 'article',
    title: item.title,
    created_at: now,
    captured_at: now,
    updated_at: now,
    source_type: 'feed',
    feed_id: feed.feed_id,
    feed_title: displayTitle(feed),
    external_id: item.external_id,
    external_id_type: item.external_id_type,
    content_provenance: item.content_is_full ? 'feed-content' : 'feed-summary',
    source: {
      capture_time: now,
      extractor: { name: 'feed', version: '1' },
      content_hash: contentHash,
    },
  };
  if (item.author) meta.author = item.author;
  if (item.published_at) meta.published_at = item.published_at;
  if (item.categories.length > 0) meta.categories = item.categories;
  if (item.link) {
    meta.source.original_url = item.link;
    meta.source.canonical_url = canonicalizeForDedupe(item.link);
  }

  await writeMeta(docDir, meta, { now });
  await writeFileAtomic(path.join(docDir, 'article.md'), markdown);
  await writeFileAtomic(
    path.join(docDir, 'source', 'feed-item.json'),
    JSON.stringify({ captured_at: now, feed_url: feed.canonical_url, item }, null, 2),
  );
  return { action: 'created', document_id: documentId, path: path.relative(libraryRoot, docDir), contentHash, externalId: item.external_id ?? null, canonicalLink: item.link ? canonicalizeForDedupe(item.link) : null };
}

/** Structured per-feed refresh (M4 §70). Never throws past fetch. */
export async function refreshFeed(libraryRoot, feedId, {
  fetchAndParseImpl = fetchAndParse,
  parsed = null, // pre-fetched outcome (from addFeedUrl) to avoid double fetch
  signal = null,
} = {}) {
  const t0 = Date.now();
  if (refreshing.has(feedId)) {
    return { feed_id: feedId, status: 'skipped-busy', fetched: 0, new_items: 0, updated_items: 0, duplicate_items: 0, unchanged: 0, error: null, duration_ms: 0 };
  }
  refreshing.add(feedId);
  const feedError = async (status, code, message) => {
    await updateFeed(libraryRoot, feedId, { last_error: { code, message } }).catch(() => {});
    return { feed_id: feedId, status, fetched: 0, new_items: 0, updated_items: 0, duplicate_items: 0, unchanged: 0, error: { code, message }, duration_ms: Date.now() - t0 };
  };
  try {
    const data = await loadFeeds(libraryRoot);
    const feed = data.feeds.find((f) => f.feed_id === feedId);
    if (!feed) return feedError('failed', 'FEED_NOT_FOUND', 'subscription missing');
    if (signal?.aborted) return feedError('cancelled', 'CANCELLED', 'refresh cancelled');
    if (!feed.enabled) {
      return { feed_id: feedId, status: 'skipped-paused', fetched: 0, new_items: 0, updated_items: 0, duplicate_items: 0, unchanged: 0, error: null, duration_ms: 0 };
    }

    // bounded retry for transient errors only (M4 §66/67)
    let outcome = parsed;
    let attempt = 0;
    for (;;) {
      try {
        outcome = outcome ?? await fetchAndParseImpl(feed.canonical_url || feed.original_url, {
          etag: feed.etag, lastModified: feed.last_modified, signal,
        });
        break;
      } catch (err) {
        const transient = err instanceof FetchError
          && [ERROR_CODES.NETWORK_ERROR].includes(err.code)
          && !/HTTP 4\d\d/.test(err.message);
        if (!transient || attempt >= MAX_RETRIES) {
          return feedError('failed', err.code ?? ERROR_CODES.NETWORK_ERROR, err.message);
        }
        attempt++;
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }

    if (outcome.notModified) {
      await updateFeed(libraryRoot, feedId, {
        last_fetched_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        etag: outcome.etag ?? feed.etag,
        last_modified: outcome.lastModified ?? feed.last_modified,
        last_error: null,
      });
      return { feed_id: feedId, status: 'not-modified', fetched: 0, new_items: 0, updated_items: 0, duplicate_items: 0, unchanged: 0, error: null, duration_ms: Date.now() - t0 };
    }

    const normalized = outcome.parsed;
    const index = await loadSearchIndex(libraryRoot);
    const { byExternal, byLink } = existingFeedDocs(index, feed.feed_id);

    let created = 0;
    let updated = 0;
    let duplicate = 0;
    let unchanged = 0;
    const rejected = [];

    for (const item of normalized.items) {
      const identity = itemIdentity(feed.feed_id, item);
      if (identity.kind === 'content-hash') {
        rejected.push({ title: item.title, reason: 'no stable identity (no guid / link)' });
        continue;
      }
      let existingDoc = item.external_id ? byExternal.get(identity.key) ?? null : null;
      if (!existingDoc && item.link) {
        // link-based fallback with its own key form (M4 §38)
        existingDoc = byLink.get(`${feed.feed_id}::${canonicalizeForDedupe(item.link)}`) ?? null;
      }

      if (existingDoc) {
        const res = await ingestItem({ libraryRoot, feed, item, existingDoc });
        if (res.action === 'updated') updated++; else unchanged++;
        continue;
      }
      try {
        const res = await ingestItem({ libraryRoot, feed, item, existingDoc: null });
        // register in the in-flight lookup maps so later items in the SAME
        // payload dedup correctly (M4 §108)
        if (res.externalId) byExternal.set(`${feed.feed_id}::${res.externalId}`, { document_id: res.document_id, path: res.path, content_hash: res.contentHash });
        if (res.canonicalLink) byLink.set(`${feed.feed_id}::${res.canonicalLink}`, { document_id: res.document_id, path: res.path, content_hash: res.contentHash });
        if (res.action === 'created') created++;
        else if (res.action === 'updated') updated++;
        else unchanged++;
      } catch (err) {
        rejected.push({ title: item.title, reason: err.message });
      }
    }

    await updateFeed(libraryRoot, feedId, {
      last_fetched_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      etag: outcome.etag ?? feed.etag,
      last_modified: outcome.lastModified ?? feed.last_modified,
      remote_title: normalized.title || feed.remote_title,
      site_url: normalized.site_url ?? feed.site_url,
      description: normalized.description ?? feed.description,
      last_error: null,
    });
    // persist the refreshed index view (invalidate alone would make the next
    // load rebuild from the STALE on-disk file)
    await refreshSearchIndex(libraryRoot);
    return {
      feed_id: feedId,
      status: rejected.length > 0 ? 'partial' : 'success',
      fetched: normalized.items.length,
      new_items: created,
      updated_items: updated,
      duplicate_items: duplicate,
      unchanged,
      rejected,
      error: null,
      duration_ms: Date.now() - t0,
    };
  } catch (err) {
    return feedError('failed', err.code ?? ERROR_CODES.UNKNOWN_ERROR, err.message);
  } finally {
    refreshing.delete(feedId);
  }
}

/** Refresh All (M4 §69/§120): bounded concurrency, partial failure allowed. */
export async function refreshAllFeeds(libraryRoot, { signal = null } = {}) {
  const data = await loadFeeds(libraryRoot);
  const enabled = data.feeds.filter((f) => f.enabled);
  const limit = pLimit(REFRESH_CONCURRENCY);
  const results = [];
  await Promise.all(enabled.map((feed) => limit(async () => {
    results.push(await refreshFeed(libraryRoot, feed.feed_id, { signal }));
  })));
  await refreshSearchIndex(libraryRoot).catch(() => {});
  const summary = {
    total: results.length,
    success: results.filter((r) => r.status === 'success' || r.status === 'not-modified').length,
    failed: results.filter((r) => r.status === 'failed').length,
    new_items: results.reduce((n, r) => n + (r.new_items ?? 0), 0),
  };
  return { ...summary, results };
}

/** User rename / enable toggle — never overwrites remote metadata (M4 §92/93). */
export async function updateFeedMeta(libraryRoot, feedId, patch) {
  const { updateFeed } = await import('./feed-store.js');
  const allowed = {};
  if (patch.enabled !== undefined) allowed.enabled = Boolean(patch.enabled);
  if (patch.custom_title !== undefined) allowed.custom_title = patch.custom_title || null;
  return updateFeed(libraryRoot, feedId, allowed);
}

export async function listFeedsWithCounts(libraryRoot) {
  const data = await loadFeeds(libraryRoot);
  const index = await loadSearchIndex(libraryRoot);
  const userState = await loadUserState();
  const { stateOf } = await import('../library/user-state.js');
  return data.feeds.map((feed) => {
    const docs = index.documents.filter((d) => d.feed_id === feed.feed_id);
    const unread = docs.filter((d) => stateOf(userState, d.document_id).read === false).length;
    return {
      ...feed,
      display_title: displayTitle(feed),
      article_count: docs.length,
      unread_count: unread,
    };
  });
}

/** Delete subscription only — existing articles REMAIN (M4 §49). */
export async function deleteFeedOnly(libraryRoot, feedId) {
  const { removeFeed } = await import('./feed-store.js');
  await removeFeed(libraryRoot, feedId);
  invalidateSearchIndex();
}
