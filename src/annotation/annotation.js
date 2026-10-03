import { FORMAT_VERSION } from '../core/meta.js';
import { isId } from '../core/ids.js';

export const ANNOTATION_TYPES = ['highlight', 'note', 'bookmark'];
export const ANNOTATION_STATUSES = ['resolved', 'orphaned'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/**
 * Create an Annotation (docs/FORMAT.md §4). `locator` is required and
 * format-specific (text-quote / epub-cfi / pdf-page-quote).
 */
export function createAnnotation(
  { documentId, type, locator, quote, prefix, suffix, note = '', tags = [], now = new Date().toISOString() },
) {
  const a = {
    format_version: FORMAT_VERSION,
    annotation_id: crypto.randomUUID(),
    document_id: documentId,
    type,
    created_at: now,
    updated_at: now,
    locator,
    note,
    tags: [...tags],
    status: 'resolved',
  };
  if (quote !== undefined) {
    a.quoted_text = quote;
    a.prefix = prefix ?? '';
    a.suffix = suffix ?? '';
  }
  return a;
}

/** Validate an annotation object (e.g. parsed from annotations.jsonl). */
export function validateAnnotation(a) {
  const errors = [];
  if (typeof a !== 'object' || a === null) return { ok: false, errors: ['annotation must be an object'] };
  if (a.format_version !== FORMAT_VERSION) errors.push(`format_version must be ${FORMAT_VERSION}`);
  if (!isId(a.annotation_id)) errors.push('annotation_id must be a UUID v4');
  if (!isId(a.document_id)) errors.push('document_id must be a UUID v4');
  if (!ANNOTATION_TYPES.includes(a.type)) errors.push(`type must be one of ${ANNOTATION_TYPES.join('|')}`);
  if (!ISO_RE.test(a.created_at ?? '')) errors.push('created_at must be ISO 8601 UTC');
  if (!ISO_RE.test(a.updated_at ?? '')) errors.push('updated_at must be ISO 8601 UTC');
  if (typeof a.locator !== 'object' || a.locator === null || typeof a.locator.kind !== 'string') {
    errors.push('locator must be an object with a kind');
  } else if (a.locator.kind === 'text-quote' && a.type === 'highlight' && typeof a.quoted_text !== 'string') {
    errors.push('text-quote highlight requires quoted_text');
  }
  if (!ANNOTATION_STATUSES.includes(a.status)) errors.push('status must be resolved|orphaned');
  if (a.tags !== undefined && !Array.isArray(a.tags)) errors.push('tags must be an array when present');
  return { ok: errors.length === 0, errors };
}

export const serializeAnnotation = (a) => JSON.stringify(a);

export function parseAnnotationLine(line) {
  const parsed = JSON.parse(line); // throws on corrupt line — caller decides policy
  const { ok, errors } = validateAnnotation(parsed);
  if (!ok) {
    const err = new Error(`invalid annotation: ${errors.join('; ')}`);
    err.code = 'INVALID_ANNOTATION';
    throw err;
  }
  return parsed;
}
