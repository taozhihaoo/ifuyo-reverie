/**
 * Daily Review (M5 §42-50): deterministic queue over existing library data.
 * NOT a gamification system — no streaks/XP. Review state is derived user
 * state, stored in REVERIE_HOME/daily-review.json, and NEVER mutates
 * read/favorite/inbox/tags of the underlying documents (M5 §46).
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../core/atomic-write.js';
import { getReverieHome } from '../core/paths.js';
import { loadSearchIndex } from '../search/search-service.js';
import { loadUserState, stateOf } from '../library/user-state.js';

export const REVIEW_STATE_VERSION = 1;
export const REVIEW_STRATEGIES = ['mixed', 'highlights', 'notes', 'unread-articles', 'older-articles'];
export const REVIEW_QUEUE_SIZE_DEFAULT = 10;

function reviewStatePath() {
  return process.env.REVERIE_REVIEW_STATE ?? path.join(getReverieHome(), 'daily-review.json');
}

/** Deterministic RNG (mulberry32): testable, reproducible (M5 §50). */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadReviewState() {
  try {
    const raw = JSON.parse(await fsp.readFile(reviewStatePath(), 'utf8'));
    if (raw?.review_state_version === REVIEW_STATE_VERSION) return raw;
  } catch { /* fresh */ }
  return { review_state_version: REVIEW_STATE_VERSION, history: {} };
}

async function saveReviewState(state) {
  await writeFileAtomic(reviewStatePath(), JSON.stringify(state, null, 2));
}

/**
 * Build the review queue for a strategy (M5 §43/44).
 * Candidates come ONLY from existing index + annotations + user state.
 * Queue is stable per (date, strategy, library fingerprint) session.
 */
export async function buildReviewQueue(libraryRoot, {
  strategy = 'mixed',
  limit = REVIEW_QUEUE_SIZE_DEFAULT,
  date = new Date().toISOString().slice(0, 10),
} = {}) {
  const index = await loadSearchIndex(libraryRoot);
  const userState = await loadUserState();
  const docs = index.documents;
  const rng = createRng(
    [...date].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 0x9e3779b9)
    ^ [...strategy].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 0x85ebca6b)
    ^ docs.length,
  );

  const candidates = [];
  const pushItem = (kind, ref, doc, context) => {
    if (candidates.length > 20000) return; // bounded
    candidates.push({ kind, ref, document_id: doc?.document_id ?? null, context });
  };

  for (const doc of docs) {
    for (const a of doc.annotations ?? []) {
      if ((a.type === 'highlight' || a.type === 'note') && (a.quoted_text || a.note)) {
        pushItem(a.type === 'highlight' ? 'highlight' : 'note', { annotation_id: a.annotation_id, status: a.status }, doc, {
          title: doc.title, author: doc.author ?? '', quoted_text: a.quoted_text ?? null, note: a.note ?? '',
        });
      }
    }
  }

  const readable = docs.filter((d) => d.read === true || d.read === false); // all docs are reviewable
  let pool;
  switch (strategy) {
    case 'highlights': pool = candidates.filter((c) => c.kind === 'highlight'); break;
    case 'notes': pool = candidates.filter((c) => c.kind === 'note'); break;
    case 'unread-articles': pool = docs.filter((d) => !d.read).map((d) => ({ kind: 'article', document: d })); break;
    case 'older-articles': {
      const sorted = [...readable].sort((a, b) => (a.captured_at ?? '').localeCompare(b.captured_at ?? ''));
      pool = sorted.slice(0, Math.ceil(sorted.length / 2)).map((d) => ({ kind: 'article', document: d }));
      break;
    }
    case 'mixed':
    default: {
      pool = [...candidates];
      for (const d of docs) pool.push({ kind: 'article', document: d });
      break;
    }
  }

  // deterministic shuffle (seeded), then interleave kinds for 'mixed'
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // dedup by identity within one session (M5 §98)
  const seen = new Set();
  const queue = [];
  for (const item of pool) {
    const id = item.kind === 'article'
      ? `doc:${item.document.document_id}`
      : `ann:${item.ref?.annotation_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const doc = item.kind === 'article' ? item.document : docs.find((d) => d.document_id === item.document_id) ?? null;
    queue.push({
      id,
      kind: item.kind,
      annotation_id: item.ref?.annotation_id ?? null,
      annotation_status: item.ref?.status ?? null,
      document_id: doc?.document_id ?? null,
      document_title: doc?.title ?? null,
      context: item.kind === 'article'
        ? { title: doc?.title ?? '', note: null }
        : item.context,
    });
    if (queue.length >= limit) break;
  }
  return { date, strategy, queue };
}

/** Persist "seen at" markers for consumed review items (derived state only). */
export async function markReviewed(items, { date = new Date().toISOString() } = {}) {
  const state = await loadReviewState();
  for (const item of items) {
    state.history[item.id] = { last_reviewed_at: date ?? new Date().toISOString() };
  }
  await saveReviewState(state);
  return state;
}

/** Verify a document still exists before navigating (M5 §97): caller re-checks via index. */
export async function documentExists(libraryRoot, documentId) {
  const index = await loadSearchIndex(libraryRoot);
  return index.documents.some((d) => d.document_id === documentId);
}
