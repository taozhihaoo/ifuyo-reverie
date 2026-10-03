import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic-write.js';
import { isId } from './ids.js';

export const FORMAT_VERSION = 1;

export const DOCUMENT_TYPES = ['article', 'book', 'pdf', 'markdown', 'text'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export class MetaVersionError extends Error {
  constructor(found) {
    super(`meta.json format_version ${found} is newer than supported ${FORMAT_VERSION}; upgrade required`);
    this.code = 'META_VERSION_TOO_NEW';
    this.found = found;
  }
}

const isIso = (v) => typeof v === 'string' && ISO_RE.test(v);

/**
 * Validate a parsed meta.json object. Required fields per docs/FORMAT.md §3.
 * Unknown extra fields are allowed and preserved (forward compatibility).
 * Returns { ok, errors } — never throws for content problems.
 */
export function validateMeta(meta) {
  const errors = [];
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    return { ok: false, errors: ['meta must be a JSON object'] };
  }
  if (meta.format_version !== FORMAT_VERSION) {
    if (typeof meta.format_version === 'number' && meta.format_version > FORMAT_VERSION) {
      errors.push(new MetaVersionError(meta.format_version).message);
    } else {
      errors.push(`format_version must be ${FORMAT_VERSION}`);
    }
  }
  if (!isId(meta.document_id)) errors.push('document_id must be a lowercase UUID v4');
  if (!DOCUMENT_TYPES.includes(meta.type)) errors.push(`type must be one of ${DOCUMENT_TYPES.join('|')}`);
  if (typeof meta.title !== 'string' || meta.title.length === 0) errors.push('title must be a non-empty string');
  if (!isIso(meta.created_at)) errors.push('created_at must be ISO 8601 UTC');
  if (!isIso(meta.updated_at)) errors.push('updated_at must be ISO 8601 UTC');
  if (meta.author !== undefined && typeof meta.author !== 'string') errors.push('author must be a string when present');
  if (meta.source !== undefined) {
    const s = meta.source;
    if (typeof s !== 'object' || s === null) errors.push('source must be an object when present');
    else {
      if (typeof s.original_url !== 'string' || s.original_url.length === 0) errors.push('source.original_url is required in source block');
      if (!isIso(s.capture_time)) errors.push('source.capture_time must be ISO 8601 UTC');
      const ex = s.extractor;
      if (typeof ex !== 'object' || ex === null || typeof ex.name !== 'string' || typeof ex.version !== 'string') {
        errors.push('source.extractor must be { name, version }');
      }
      if (s.canonical_url !== undefined && typeof s.canonical_url !== 'string') errors.push('source.canonical_url must be a string when present');
      if (s.content_hash !== undefined && (typeof s.content_hash !== 'string' || !s.content_hash.startsWith('sha256-'))) errors.push('source.content_hash must be "sha256-<hex>"');
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Read + validate `<dir>/meta.json`. Throws only for missing/unparsable file
 * or a too-new format version (MetaVersionError). */
export async function readMeta(dirPath) {
  const raw = await fsp.readFile(path.join(dirPath, 'meta.json'), 'utf8');
  let meta;
  try {
    meta = JSON.parse(raw);
  } catch (err) {
    throw new Error(`meta.json is not valid JSON: ${err.message}`);
  }
  if (typeof meta.format_version === 'number' && meta.format_version > FORMAT_VERSION) {
    throw new MetaVersionError(meta.format_version);
  }
  const { ok, errors } = validateMeta(meta);
  if (!ok) throw new Error(`meta.json failed validation:\n- ${errors.join('\n- ')}`);
  return meta;
}

/** Write meta.json atomically, stamping updated_at. Preserves unknown fields. */
export async function writeMeta(dirPath, meta, { now = new Date().toISOString() } = {}) {
  const stamped = { ...meta, updated_at: isIso(meta.updated_at) ? meta.updated_at : now };
  const { ok, errors } = validateMeta(stamped);
  if (!ok) throw new Error(`refusing to write invalid meta.json:\n- ${errors.join('\n- ')}`);
  await writeFileAtomic(path.join(dirPath, 'meta.json'), JSON.stringify(stamped, null, 2) + '\n');
  return stamped;
}
