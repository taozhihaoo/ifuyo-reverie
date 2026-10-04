/**
 * AnnotationService (M2 §24) — the only business layer for annotations.
 * UI never touches annotations.jsonl directly; persistence details stay here.
 *
 * Status model (FORMAT.md v1, code-first): `resolved` (== doc's "active")
 * and `orphaned`. Resolution failure NEVER deletes an annotation.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAnnotation } from './annotation.js';
import {
  readAnnotationsFile,
  appendAnnotation,
  updateAnnotation,
  removeAnnotation,
  rewriteAnnotations,
} from './store.js';
import { resolveTextAnchor } from './resolver.js';

export const ANNOTATION_FILE = 'annotations.jsonl';

const sha256hex = (s) => 'sha256-' + createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** Resolve one annotation against canonical reader text (deterministic, M2 §15). */
export function resolveAnnotation(annotation, canonicalText, { currentHash = null } = {}) {
  const anchor = annotation.locator ?? {};
  // Step 1: position + hash agreement — when the document hash matches the
  // hash at creation time AND the quote still verifies, trust the position.
  if (
    currentHash &&
    annotation.source_content_hash === currentHash &&
    anchor.position &&
    canonicalText.slice(anchor.position.start, anchor.position.end) === annotation.quoted_text
  ) {
    return { status: 'resolved', start: anchor.position.start, end: anchor.position.end, quality: 'hash-position' };
  }
  const result = resolveTextAnchor(
    { quote: annotation.quoted_text, prefix: annotation.prefix ?? '', suffix: annotation.suffix ?? '', position: anchor.position },
    canonicalText,
  );
  if (result.status === 'ambiguous') {
    return { status: 'orphaned', reason: result.reason, quality: 'ambiguous' };
  }
  return result; // resolved | orphaned
}

/**
 * Create a service bound to one article directory.
 * canonicalText provider is injected so the service stays DOM-free.
 */
export function createAnnotationService({ articleDir, documentId, getReaderContext }) {
  const filePath = path.join(articleDir, ANNOTATION_FILE);

  const context = async () => {
    if (!getReaderContext) throw new Error('no reader context provider configured');
    const { canonicalText, contentHash } = await getReaderContext();
    return { canonicalText, contentHash: contentHash ?? sha256hex(canonicalText) };
  };

  return {
    /** Create a highlight (optionally with a plain-text note) from an anchor
     * {quote, prefix, suffix, position}. Persisted via atomic append. */
    async createHighlight({ anchor, note = '' }) {
      if (!anchor?.quote || anchor.quote.trim() === '') throw new Error('anchor.quote is required');
      const { canonicalText } = await context();
      // create-time validation (M2 §36): the anchor MUST resolve against the
      // canonical reader text, otherwise we would persist an unfindable mark.
      const check = resolveTextAnchor(anchor, canonicalText);
      if (check.status !== 'resolved') {
        throw new Error(`anchor does not resolve against the document (${check.status ?? 'unknown'})`);
      }
      const { contentHash } = await context();
      const annotation = createAnnotation({
        documentId,
        type: 'highlight',
        locator: { kind: 'text-quote', position: { start: check.start, end: check.end } },
        quote: anchor.quote,
        prefix: anchor.prefix ?? '',
        suffix: anchor.suffix ?? '',
        note,
      });
      annotation.source_content_hash = contentHash;
      await appendAnnotation(filePath, annotation);
      return { annotation, resolution: check };
    },

    /** Plain-text note on an existing highlight (M2 §27/§28). */
    async updateNote(annotationId, note) {
      if (typeof note !== 'string') throw new Error('note must be a string');
      return updateAnnotation(filePath, annotationId, { note });
    },

    /** Hard delete: removed from the file (atomic rewrite), user-action only. */
    async delete(annotationId) {
      return removeAnnotation(filePath, annotationId);
    },

    /** Manual repair (M2 §32): replace the anchor, keep the annotation_id. */
    async repair(annotationId, { anchor }) {
      if (!anchor?.quote) throw new Error('anchor.quote is required');
      const { canonicalText } = await context();
      const check = resolveTextAnchor(anchor, canonicalText);
      if (check.status !== 'resolved') {
        throw new Error(`replacement anchor does not resolve (${check.status ?? 'unknown'})`);
      }
      const { annotations } = await readAnnotationsFile(filePath, { documentId });
      const target = annotations.find((a) => a.annotation_id === annotationId);
      if (!target) throw new Error(`annotation not found: ${annotationId}`);
      const { contentHash } = await context();
      const updated = await updateAnnotation(filePath, annotationId, {
        type: target.type === 'note' ? 'highlight' : target.type,
        quoted_text: anchor.quote,
        prefix: anchor.prefix ?? '',
        suffix: anchor.suffix ?? '',
        locator: { kind: 'text-quote', position: { start: check.start, end: check.end } },
        source_content_hash: contentHash,
        status: 'resolved',
      });
      return { annotation: updated, resolution: check };
    },

    /** Create a bookmark at a reader location (M6 §38): no text anchor —
     * locator describes the position; status stays resolved. */
    async createBookmark({ location, note = '' }) {
      if (!location || typeof location !== 'object') throw new Error('bookmark location is required');
      const annotation = createAnnotation({
        documentId,
        type: 'bookmark',
        locator: { kind: 'reader-location', location },
        note,
      });
      await appendAnnotation(filePath, annotation);
      return { annotation };
    },

    /** Load all annotations with fresh resolution results (M2 §19). */
    async listResolved() {
      const { canonicalText, contentHash } = await context();
      const { annotations, invalid, duplicates } = await readAnnotationsFile(filePath, { documentId });
      let changed = false;
      const resolved = annotations.map((a) => {
        // bookmarks carry a reader location, not a text anchor (M6 §38)
        if (a.type === 'bookmark') {
          return { ...a, resolution: { status: 'resolved', quality: 'location' } };
        }
        const result = resolveAnnotation(a, canonicalText, { currentHash: contentHash });
        const nextStatus = result.status === 'resolved' ? 'resolved' : 'orphaned';
        if (a.status !== nextStatus || (result.status === 'resolved' && (result.start !== a.locator?.position?.start || result.end !== a.locator?.position?.end))) {
          a.status = nextStatus;
          if (result.status === 'resolved') {
            a.locator = { kind: a.locator?.kind ?? 'text-quote', position: { start: result.start, end: result.end } };
          }
          a.updated_at = new Date().toISOString();
          changed = true;
        }
        return { ...a, resolution: result };
      });
      // persist only when something actually changed (no pointless rewrites)
      if (changed) {
        await rewriteAnnotations(filePath, resolved.map(({ resolution, ...a }) => a));
      }
      return { annotations: resolved, invalid, duplicates, contentHash };
    },
  };
}
