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
          created_at: meta.created_at,
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
