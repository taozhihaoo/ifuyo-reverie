/**
 * Book ingestion (M6): add an EPUB file to the library as a type=book
 * document. The original file is copied (never referenced in place) so the
 * library remains self-contained; the file is immutable afterwards (M6 §17).
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { newId } from '../core/ids.js';
import { writeMeta } from '../core/meta.js';
import { openBookSession } from '../reader/epub-reader-core.js';

export async function addEpubBook(libraryRoot, sourceEpubPath, {
  title = null, author = null, now = new Date().toISOString(),
} = {}) {
  const buf = await fsp.readFile(sourceEpubPath);
  const session = await openBookSession(sourceEpubPath);
  const documentId = newId();
  const docDir = path.join(libraryRoot, 'books', documentId);

  const contentHash = 'sha256-' + createHash('sha256').update(buf).digest('hex');
  const meta = {
    format_version: 1,
    document_id: documentId,
    type: 'book',
    title: title || session.metadata.title || path.basename(sourceEpubPath, '.epub'),
    created_at: now,
    captured_at: now,
    updated_at: now,
    source_type: 'epub-file',
    source: {
      capture_time: now,
      extractor: { name: 'epub-container', version: '1' },
      content_hash: contentHash,
    },
  };
  // optional fields are OMITTED when absent, never null (meta validator, M1)
  if (author || session.metadata.author) meta.author = author || session.metadata.author;
  if (session.metadata.language) meta.language = session.metadata.language;
  if (meta.title === null || meta.title === '') meta.title = '未命名图书';

  await fsp.mkdir(docDir, { recursive: true });
  await writeMeta(docDir, meta, { now });
  await fsp.writeFile(path.join(docDir, 'book.epub'), buf);
  return { document_id: documentId, dir: docDir, meta };
}

/** Path to the book.epub for a book document dir. */
export function bookEpubPath(docDir) {
  return path.join(docDir, 'book.epub');
}
