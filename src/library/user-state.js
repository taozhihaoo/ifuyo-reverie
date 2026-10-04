/**
 * User-owned library state (M3 §7-§17): read / favorite / inbox / tags /
 * last_opened_at. Lives INSIDE the library-facing app-state file and is the
 * Source of Truth — the derived index only mirrors it.
 *
 * Storage: REVERIE_HOME/user-state.json (atomic writes). Legacy
 * read-state.json (M1) is migrated on first load and left in place.
 *
 * Defaults for a document with no entry (M3 §10): unread, not favorite,
 * in inbox, no tags — a fresh capture is "waiting to be processed".
 */
import { promises as fsp } from 'node:fs';
import { writeFileAtomic } from '../core/atomic-write.js';
import { getReadStatePath, getLibraryRoot } from '../core/paths.js';
import path from 'node:path';

export const USER_STATE_VERSION = 1;

export const DEFAULT_DOCUMENT_STATE = Object.freeze({
  read: false,
  favorite: false,
  inbox: true,
  tags: [],
  last_opened_at: null,
  last_read_at: null,
});

export const MAX_TAG_LENGTH = 64;

/**
 * Tag canonicalization (M3 §15/16): trim, collapse inner whitespace, reject
 * empty/oversized/control-char tags. Comparison is case-insensitive; the
 * first-created display form is preserved.
 */
export function canonicalTag(raw) {
  if (typeof raw !== 'string') return null;
  const display = raw.trim().replace(/\s+/g, ' ');
  if (display.length === 0 || display.length > MAX_TAG_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(display)) return null;
  return { key: display.toLowerCase(), display };
}

/** Normalize a tag list: canonicalize, dedupe by key, keep first display. */
export function normalizeTags(rawTags) {
  const byKey = new Map();
  for (const raw of Array.isArray(rawTags) ? rawTags : []) {
    const tag = canonicalTag(raw);
    if (tag && !byKey.has(tag.key)) byKey.set(tag.key, tag.display);
  }
  return [...byKey.values()];
}

export function userStatePath() {
  // M3 §7: user state belongs to the LIBRARY (moves/syncs with the user's
  // files), not to app data. Env override exists for tests.
  return process.env.REVERIE_USER_STATE ?? path.join(getLibraryRoot(), 'user-state.json');
}

const migrateLegacyReadState = (legacy) => {
  const states = {};
  if (legacy && typeof legacy.states === 'object') {
    for (const [documentId, entry] of Object.entries(legacy.states)) {
      states[documentId] = {
        ...DEFAULT_DOCUMENT_STATE,
        read: entry?.state === 'read',
        last_read_at: entry?.state === 'read' ? (entry.updated_at ?? null) : null,
        updated_at: entry?.updated_at ?? null,
      };
    }
  }
  return states;
};

let cache = null;

/** Load user state (cached per process; tests can forceReload). */
export async function loadUserState({ forceReload = false } = {}) {
  if (cache && !forceReload) return cache;
  const filePath = userStatePath();
  let data = null;
  try {
    data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    if (data?.schema_version !== USER_STATE_VERSION || typeof data.states !== 'object') data = null;
  } catch { /* missing or torn -> migrate/defaults */ }

  if (data) {
    cache = data;
    return cache;
  }

  // migration from the M1 read-state.json, then persist immediately
  let legacy = null;
  try {
    legacy = JSON.parse(await fsp.readFile(getReadStatePath(), 'utf8'));
  } catch { /* no legacy */ }
  cache = { schema_version: USER_STATE_VERSION, states: migrateLegacyReadState(legacy) };
  await writeFileAtomic(filePath, JSON.stringify(cache, null, 2));
  return cache;
}

/** State of one document with defaults applied (never mutates storage). */
export function stateOf(userState, documentId) {
  const s = userState.states[documentId] ?? {};
  return {
    ...DEFAULT_DOCUMENT_STATE,
    ...s,
    tags: normalizeTags(s.tags),
  };
}

/** Patch one document's state (create/merge), atomic; returns the new state. */
export async function updateUserState(documentId, patch, { now = new Date().toISOString() } = {}) {
  const userState = await loadUserState();
  const current = stateOf(userState, documentId);
  const next = { ...current };
  if (patch.read !== undefined) {
    next.read = Boolean(patch.read);
    if (patch.read) next.last_read_at = now;
  }
  if (patch.favorite !== undefined) next.favorite = Boolean(patch.favorite);
  if (patch.inbox !== undefined) next.inbox = Boolean(patch.inbox);
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  if (patch.last_opened_at !== undefined) next.last_opened_at = patch.last_opened_at;
  if (patch.last_location !== undefined) {
    // M6/M7 reading position: { chapter_index | page_index, scroll_ratio } —
    // free-form but validated minimally; belongs to the user, never into the
    // source file. Books use chapter_index, PDFs use page_index (M7 §30:
    // internal index is identity, display labels are UI-only).
    const loc = patch.last_location;
    const idx = loc && typeof loc === 'object'
      ? (Number.isInteger(loc.chapter_index) && loc.chapter_index >= 0
          ? { chapter_index: loc.chapter_index }
          : (Number.isInteger(loc.page_index) && loc.page_index >= 0
              ? { page_index: loc.page_index }
              : null))
      : null;
    if (idx) {
      next.last_location = { ...idx, scroll_ratio: Number(loc.scroll_ratio ?? 0) || 0 };
    }
  }
  next.updated_at = now;
  userState.states[documentId] = next;
  await writeFileAtomic(userStatePath(), JSON.stringify(userState, null, 2));
  cache = userState;
  return next;
}

/** Forget a deleted document's state. */
export async function forgetDocument(documentId) {
  const userState = await loadUserState();
  if (!(documentId in userState.states)) return false;
  delete userState.states[documentId];
  await writeFileAtomic(userStatePath(), JSON.stringify(userState, null, 2));
  cache = userState;
  return true;
}

/** Test hook: clear the in-process cache. */
export function resetCacheForTests() {
  cache = null;
}
