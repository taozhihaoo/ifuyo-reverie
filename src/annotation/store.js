import { promises as fsp } from 'node:fs';
import { appendLine, writeFileAtomic } from '../core/atomic-write.js';
import { parseAnnotationLine, serializeAnnotation } from './annotation.js';

/**
 * annotations.jsonl persistence (M2 §20-23).
 * Append for creation (cheap, crash-safe), atomic full rewrite for
 * update/delete (explicitly allowed by M2 §21). Corruption policy: bad lines
 * are skipped and reported — never crash the library, never auto-rewrite.
 */
export async function readAnnotationsFile(filePath, { documentId = null } = {}) {
  let raw;
  try {
    raw = await fsp.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { annotations: [], invalid: [], duplicates: [] };
    }
    throw err;
  }
  const annotations = [];
  const invalid = [];
  const seenIds = new Map(); // annotation_id -> first line
  const duplicates = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    try {
      const a = parseAnnotationLine(line);
      if (documentId && a.document_id !== documentId) {
        invalid.push({ line: i + 1, reason: `document_id mismatch: ${a.document_id}` });
        continue;
      }
      if (seenIds.has(a.annotation_id)) {
        duplicates.push({ annotation_id: a.annotation_id, first_line: seenIds.get(a.annotation_id), line: i + 1 });
        continue;
      }
      seenIds.set(a.annotation_id, i + 1);
      annotations.push(a);
    } catch (err) {
      invalid.push({ line: i + 1, reason: err.message });
    }
  }
  return { annotations, invalid, duplicates };
}

/** Append one annotation as a new line (validate first, fail closed). */
export async function appendAnnotation(filePath, annotation) {
  // parse-back check ensures serialize->parse round-trip before touching disk
  const line = serializeAnnotation(annotation);
  parseAnnotationLine(line);
  await appendLine(filePath, line);
}

/**
 * Atomically rewrite the whole file (update / delete / repair, M2 §21).
 * Crash can leave either the old file or the new file — never a half JSON.
 */
export async function rewriteAnnotations(filePath, annotations) {
  const seen = new Set();
  const lines = [];
  for (const a of annotations) {
    if (seen.has(a.annotation_id)) throw new Error(`duplicate annotation_id in rewrite: ${a.annotation_id}`);
    seen.add(a.annotation_id);
    lines.push(serializeAnnotation(a));
  }
  await writeFileAtomic(filePath, lines.length > 0 ? lines.join('\n') + '\n' : '');
}

export async function updateAnnotation(filePath, annotationId, patch, { now = new Date().toISOString() } = {}) {
  const { annotations } = await readAnnotationsFile(filePath);
  const target = annotations.find((a) => a.annotation_id === annotationId);
  if (!target) throw new Error(`annotation not found: ${annotationId}`);
  const next = { ...target, ...patch, annotation_id: target.annotation_id, updated_at: now };
  parseAnnotationLine(serializeAnnotation(next)); // validate before disk
  await rewriteAnnotations(filePath, annotations.map((a) => (a.annotation_id === annotationId ? next : a)));
  return next;
}

export async function removeAnnotation(filePath, annotationId) {
  const { annotations } = await readAnnotationsFile(filePath);
  const next = annotations.filter((a) => a.annotation_id !== annotationId);
  if (next.length === annotations.length) throw new Error(`annotation not found: ${annotationId}`);
  await rewriteAnnotations(filePath, next);
  return { removed: annotationId };
}
