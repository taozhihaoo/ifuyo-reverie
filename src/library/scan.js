import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readMeta } from '../core/meta.js';
import { readAnnotationsFile } from '../annotation/store.js';

const DOC_TYPES = new Set(['articles', 'books', 'pdf', 'markdown', 'text']);

/**
 * Scan a library directory and build index entries from FILES ONLY.
 * The scanner never writes to the library — it is the read half of
 * `Library Files -> Indexer -> SQLite`.
 */
export async function scanLibrary(libraryRoot) {
  const entries = [];
  const errors = [];
  await walk(libraryRoot);
  return { entries, errors };

  async function walk(dir) {
    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      errors.push({ path: dir, reason: err.message });
      return;
    }
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      if (d.name.startsWith('.')) continue; // staging (.tmp-*) and hidden dirs are not documents
      if (d.name === 'exports' || DOC_TYPES.has(d.name)) {
        await walk(path.join(dir, d.name));
        continue;
      }
      const docDir = path.join(dir, d.name);
      const metaPath = path.join(docDir, 'meta.json');
      if (!await exists(metaPath)) {
        await walk(docDir); // year buckets etc.
        continue;
      }
      try {
        const meta = await readMeta(docDir);
        const { annotations, invalid } = await readAnnotationsFile(path.join(docDir, 'annotations.jsonl'));
        if (invalid.length > 0) {
          errors.push({ path: docDir, reason: `${invalid.length} unparsable annotation line(s)` });
        }
        entries.push({
          document_id: meta.document_id,
          type: meta.type,
          title: meta.title,
          author: meta.author ?? null,
          dir: path.relative(libraryRoot, docDir),
          annotation_count: annotations.length,
          // annotation projection (M2 §42): derived from annotations.jsonl,
          // rebuilt with the index — never the source of truth
          annotations: annotations.slice(0, 500).map((a) => ({
            annotation_id: a.annotation_id,
            document_id: a.document_id,
            type: a.type,
            status: a.status,
            created_at: a.created_at,
            updated_at: a.updated_at,
            selected_text: a.quoted_text ?? null,
          })),
          created_at: meta.created_at,
          captured_at: meta.captured_at ?? null,
          published_at: meta.published_at ?? null,
          language: meta.language ?? null,
          original_url: meta.source?.original_url ?? null,
          canonical_url: meta.source?.canonical_url ?? null,
          content_hash: meta.source?.content_hash ?? null,
        });
      } catch (err) {
        errors.push({ path: docDir, reason: err.message });
      }
    }
  }
}

/** Deterministic index content — used to prove rebuild == original index. */
export function indexFingerprint(index) {
  return createHash('sha256')
    .update(JSON.stringify(index.entries.sort((x, y) => x.document_id.localeCompare(y.document_id))))
    .digest('hex');
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}
