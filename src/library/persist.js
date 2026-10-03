/**
 * Library persistence (M1 §14-17): staging directory -> write everything ->
 * validate -> atomic promote. A crash can only leave a `.tmp-*` sibling
 * behind, never a half-written official article directory.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileAtomic } from '../core/atomic-write.js';
import { readMeta } from '../core/meta.js';
import { ERROR_CODES } from '../capture/protocol.js';

export class PersistError extends Error {
  constructor(message) {
    super(message);
    this.error_code = ERROR_CODES.PERSIST_FAILED;
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Write a captured article into the library atomically.
 * Returns the final article directory.
 */
export async function captureToLibrary({
  libraryRoot,
  meta,
  articleMarkdown,
  sourceHtml,
  assets = [], // [{ filename: 'assets/<hash>.<ext>', buffer }]
  now = new Date().toISOString(),
}) {
  const year = String((meta.captured_at ?? now)).slice(0, 4);
  const staging = path.join(libraryRoot, 'articles', year, `.tmp-${meta.document_id}`);
  const final = path.join(libraryRoot, 'articles', year, meta.document_id);

  try {
    await fsp.mkdir(path.join(staging, 'source'), { recursive: true });
    await writeFileAtomic(path.join(staging, 'article.md'), articleMarkdown);
    await writeFileAtomic(path.join(staging, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    if (sourceHtml !== null && sourceHtml !== undefined) {
      await writeFileAtomic(path.join(staging, 'source', 'page.html'), sourceHtml);
    }
    for (const a of assets) {
      await writeFileAtomic(path.join(staging, a.filename), a.buffer);
    }

    validateStaging({ staging, meta, articleMarkdown, assets });

    // promote: rename is atomic on the same volume; refuse to overwrite
    if (await exists(final)) {
      throw new PersistError(`article directory already exists: ${meta.document_id}`);
    }
    await fsp.rename(staging, final);
    return final;
  } catch (err) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/** M1 §17: post-write consistency checks BEFORE status = completed. */
export function validateStaging({ staging, meta, articleMarkdown, assets }) {
  const articleBuf = Buffer.from(articleMarkdown, 'utf8');
  const expectedHash = 'sha256-' + sha256(articleBuf);
  if (meta.source?.content_hash !== expectedHash) {
    throw new PersistError('content_hash mismatch — refusing to promote');
  }
  const referenced = [...articleMarkdown.matchAll(/assets\/[0-9a-f]{64}\.\w+/g)].map((m) => m[0]);
  const provided = new Set(assets.map((a) => a.filename));
  for (const ref of referenced) {
    if (!provided.has(ref)) {
      throw new PersistError(`article references missing asset: ${ref}`);
    }
  }
  if (articleMarkdown.trim().length === 0) {
    throw new PersistError('article.md is empty');
  }
  return { ok: true, staging };
}

/** Re-verify an already-promoted article directory (M1 §17). */
export async function verifyArticleDir(articleDir) {
  const meta = await readMeta(articleDir); // throws on invalid
  const md = await fsp.readFile(path.join(articleDir, 'article.md'));
  if ('sha256-' + sha256(md) !== meta.source?.content_hash) {
    throw new PersistError(`content_hash mismatch in ${articleDir}`);
  }
  return meta;
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}
