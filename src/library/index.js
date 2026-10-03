/**
 * Derived index + read state (M1 §19-20).
 *
 * index.json and read-state.json live in REVERIE_HOME (NEVER in the
 * library), are disposable, and are fully rebuildable from library files.
 * SQLite is deferred to M3 (full-text search); the boundary is identical:
 * Library Files -> Indexer -> derived store -> delete/rebuild at will.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../core/atomic-write.js';
import { getIndexPath, getReadStatePath } from '../core/paths.js';
import { scanLibrary } from './scan.js';

export const INDEX_VERSION = 1;
export const READ_STATES = ['unread', 'read'];

export async function rebuildIndex(libraryRoot, indexPath = getIndexPath(), { now = new Date().toISOString() } = {}) {
  const { entries, errors } = await scanLibrary(libraryRoot);
  const index = {
    index_version: INDEX_VERSION,
    built_at: now,
    entries: entries.map((e) => ({
      document_id: e.document_id,
      type: e.type,
      title: e.title,
      author: e.author,
      canonical_url: e.canonical_url,
      original_url: e.original_url,
      captured_at: e.captured_at,
      published_at: e.published_at,
      language: e.language,
      content_hash: e.content_hash,
      path: e.dir,
      annotation_count: e.annotation_count,
    })),
  };
  await writeFileAtomic(indexPath, JSON.stringify(index, null, 2));
  return { index, errors };
}

/** Load the index; rebuild automatically when missing/corrupt. */
export async function loadIndex(libraryRoot, indexPath = getIndexPath()) {
  try {
    const raw = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
    if (raw.index_version === INDEX_VERSION && Array.isArray(raw.entries)) return raw;
  } catch { /* missing or torn -> rebuild */ }
  const { index } = await rebuildIndex(libraryRoot, indexPath);
  return index;
}

/** Read state: app-level, never written into article.md (M1 §19). */
export async function loadReadState(readStatePath = getReadStatePath()) {
  try {
    const raw = JSON.parse(await fsp.readFile(readStatePath, 'utf8'));
    if (raw.read_state_version === 1 && typeof raw.states === 'object') return raw;
  } catch { /* fall through */ }
  return { read_state_version: 1, states: {} };
}

export async function setReadState(documentId, state, readStatePath = getReadStatePath(), { now = new Date().toISOString() } = {}) {
  if (!READ_STATES.includes(state)) throw new Error(`unknown read state: ${state}`);
  const current = await loadReadState(readStatePath);
  current.states[documentId] = { state, updated_at: now };
  await writeFileAtomic(readStatePath, JSON.stringify(current, null, 2));
  return current;
}

/** Delete a user-selected article (explicit action — never automatic). */
export async function deleteArticle(libraryRoot, documentId) {
  const index = await loadIndex(libraryRoot);
  const entry = index.entries.find((e) => e.document_id === documentId);
  if (!entry) throw new Error(`unknown document: ${documentId}`);
  const dir = entry.path;
  if (dir.includes('..')) throw new Error('suspicious index path');
  const target = path.join(libraryRoot, dir);
  await fsp.rm(target, { recursive: true, force: true });
  return { deleted: dir };
}
