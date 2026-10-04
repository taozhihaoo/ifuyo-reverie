/**
 * FeedStore (M4 §12-13): feed subscriptions are USER DATA, so they live in
 * the Library as `<Library>/feeds.json` (atomic writes; deletable-DB-proof).
 *
 * Stable metadata and runtime fetch state are kept per feed (M4 §13).
 */
import path from 'node:path';
import { writeFileAtomic } from '../core/atomic-write.js';
import { UnsupportedVersionError } from '../core/errors.js';
import { newId } from '../core/ids.js';

export const FEEDS_VERSION = 1;

export function feedsPath(libraryRoot) {
  return process.env.REVERIE_FEEDS ?? path.join(libraryRoot, 'feeds.json');
}

/** Canonical URL for dedup (M4 §90/91): host lowercase, no fragment,
 * trailing slash stripped, tracking params dropped, query order stable. */
export function canonicalizeFeedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
    const drop = [];
    for (const [k] of u.searchParams) {
      if (/^utm_/i.test(k) || /^(fbclid|gclid)$/i.test(k)) drop.push(k);
    }
    for (const k of drop) u.searchParams.delete(k);
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const qs = params.map(([k, v]) => `${k}=${v}`).join('&');
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host}${u.pathname}${qs ? '?' + qs : ''}`;
  } catch {
    return rawUrl;
  }
}

export async function loadFeeds(libraryRoot) {
  const { promises: fsp } = await import('node:fs');
  try {
    const raw = JSON.parse(await fsp.readFile(feedsPath(libraryRoot), 'utf8'));
    if (typeof raw?.feeds_version === 'number' && raw.feeds_version > FEEDS_VERSION
      && Array.isArray(raw.feeds)) {
      // M10 §26: future version → read-only protection; the marker travels on
      // the returned object so every save path refuses to overwrite it
      return { feeds_version: raw.feeds_version, feeds: raw.feeds, unsupported: true };
    }
    if (raw?.feeds_version === FEEDS_VERSION && Array.isArray(raw.feeds)) return raw;
  } catch { /* missing/torn -> fresh */ }
  return { feeds_version: FEEDS_VERSION, feeds: [] };
}

export async function saveFeeds(libraryRoot, data) {
  if (data?.unsupported) {
    throw new UnsupportedVersionError('订阅文件', feedsPath(libraryRoot), data.feeds_version, FEEDS_VERSION);
  }
  await writeFileAtomic(feedsPath(libraryRoot), JSON.stringify(data, null, 2));
}

/** Doctor visibility: is the subscriptions file version-locked read-only? */
export async function feedsUnsupportedVersion(libraryRoot) {
  const data = await loadFeeds(libraryRoot);
  return data.unsupported ? data.feeds_version : null;
}

/** Create a subscription. Caller must have validated the feed (M4 §88). */
export async function addFeed(libraryRoot, { originalUrl, canonicalUrl, parse }) {
  const data = await loadFeeds(libraryRoot);
  const canonical = canonicalizeFeedUrl(canonicalUrl ?? originalUrl);
  const existing = data.feeds.find((f) => f.canonical_url === canonical
    || canonicalizeFeedUrl(f.original_url) === canonical);
  if (existing) return { duplicate: true, feed: existing };

  const now = new Date().toISOString();
  const feed = {
    feed_id: newId(),
    original_url: originalUrl,
    canonical_url: canonical,
    custom_title: null, // user rename; display = custom_title || remote_title (M4 §92)
    remote_title: parse.title ?? null,
    site_url: parse.site_url ?? null,
    description: parse.description ?? null,
    language: parse.language ?? null,
    image_url: parse.image_url ?? null,
    format: parse.format,
    enabled: true,
    etag: null,
    last_modified: null,
    last_fetched_at: null,
    last_success_at: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
  data.feeds.push(feed);
  await saveFeeds(libraryRoot, data);
  return { duplicate: false, feed };
}

export async function updateFeed(libraryRoot, feedId, patch, { now = new Date().toISOString() } = {}) {
  const data = await loadFeeds(libraryRoot);
  const feed = data.feeds.find((f) => f.feed_id === feedId);
  if (!feed) throw new Error(`feed not found: ${feedId}`);
  Object.assign(feed, patch, { feed_id: feed.feed_id, updated_at: now });
  await saveFeeds(libraryRoot, data);
  return feed;
}

export async function removeFeed(libraryRoot, feedId) {
  const data = await loadFeeds(libraryRoot);
  const next = data.feeds.filter((f) => f.feed_id !== feedId);
  if (next.length === data.feeds.length) throw new Error(`feed not found: ${feedId}`);
  data.feeds = next;
  await saveFeeds(libraryRoot, data);
}

export function displayTitle(feed) {
  return feed.custom_title || feed.remote_title || feed.original_url;
}
