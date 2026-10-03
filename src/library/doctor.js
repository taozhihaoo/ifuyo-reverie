/**
 * Doctor (M3 §62/§100/§102): consistency checks across files, index, and
 * annotations. Read-only — reports findings, never mutates user data.
 *
 * Checks:
 *  - duplicate document_id across scanned directories
 *  - meta.json unreadable / unsupported format_version
 *  - index references documents that no longer exist (stale index)
 *  - library documents missing from the index (stale index)
 *  - broken/escaping paths in the index
 *  - duplicate annotation ids / corrupt annotation lines per document
 */
import path from 'node:path';
import { scanLibrary } from './scan.js';
import { loadSearchIndex } from '../search/search-service.js';
import { readAnnotationsFile } from '../annotation/store.js';

export async function runDoctor(libraryRoot) {
  const findings = [];
  const add = (severity, code, detail) => findings.push({ severity, code, detail });

  const { entries, errors } = await scanLibrary(libraryRoot);

  for (const err of errors) {
    add('error', 'document_unreadable', `${err.path}: ${err.reason}`);
  }

  // duplicate document ids in files
  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.document_id)) byId.set(e.document_id, []);
    byId.get(e.document_id).push(e.dir);
  }
  for (const [documentId, dirs] of byId) {
    if (dirs.length > 1) {
      add('error', 'duplicate_document_id', `${documentId} appears in: ${dirs.join(', ')}`);
    }
  }

  // index vs files
  let index = null;
  try {
    index = await loadSearchIndex(libraryRoot);
  } catch (err) {
    add('error', 'index_unreadable', err.message);
  }
  if (index) {
    const indexedIds = new Set(index.documents.map((d) => d.document_id));
    for (const d of index.documents) {
      if (d.path.includes('..') || path.isAbsolute(d.path)) {
        add('error', 'broken_index_path', `${d.document_id}: ${d.path}`);
      }
      if (!byId.has(d.document_id) && d.type !== undefined) {
        // file-level check: the scanner entry may exist while the id differs
        if (!entries.some((e) => e.document_id === d.document_id)) {
          add('warning', 'stale_index_entry', `index has ${d.document_id} (${d.path}) but files do not`);
        }
      }
      for (const a of d.annotations ?? []) {
        if (!a.annotation_id) add('error', 'annotation_missing_id', `${d.document_id}: annotation without id`);
      }
    }
    for (const e of entries) {
      if (!indexedIds.has(e.document_id)) {
        add('warning', 'document_missing_from_index', `${e.document_id} (${e.dir}) not in search index — run reindex`);
      }
    }
  }

  // per-document annotation diagnostics
  for (const e of entries) {
    const { invalid, duplicates } = await readAnnotationsFile(path.join(libraryRoot, e.dir, 'annotations.jsonl'), { documentId: e.document_id });
    for (const inv of invalid) add('warning', 'annotation_corrupt', `${e.dir} line ${inv.line}: ${inv.reason}`);
    for (const dup of duplicates) add('warning', 'annotation_duplicate_id', `${e.dir}: ${dup.annotation_id} first at line ${dup.first_line}, duplicated at line ${dup.line}`);
  }

  const stats = {
    documents: byId.size,
    index_documents: index?.documents.length ?? null,
    checks: 6,
  };
  return { ok: findings.every((f) => f.severity !== 'error'), findings, stats };
}
