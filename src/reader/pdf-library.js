/**
 * PDF ingestion (M7): add a PDF file to the library as a type=pdf document.
 * Mirrors addEpubBook (M6): the original file is copied byte-identically into
 * the library and is immutable afterwards; user data lives beside it
 * (meta.json / annotations.jsonl), never inside the PDF (M7 §59).
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { newId } from '../core/ids.js';
import { writeMeta } from '../core/meta.js';
import { openPdfDocument, closePdfDocument, extractPdfMeta } from './pdf-reader-core.js';

export async function addPdfBook(libraryRoot, sourcePdfPath, {
  title = null, author = null, now = new Date().toISOString(),
} = {}) {
  const buf = await fsp.readFile(sourcePdfPath);
  const doc = await openPdfDocument(sourcePdfPath);
  let pdfMeta = {};
  let pageCount = 0;
  try {
    pdfMeta = await extractPdfMeta(doc);
    pageCount = doc.numPages;
  } finally {
    await closePdfDocument(doc);
  }

  const documentId = newId();
  const docDir = path.join(libraryRoot, 'pdf', documentId);
  const contentHash = 'sha256-' + createHash('sha256').update(buf).digest('hex');
  const meta = {
    format_version: 1,
    document_id: documentId,
    type: 'pdf',
    // metadata title → filename → generic (M7 §54 fallback chain)
    title: title || pdfMeta.title || path.basename(sourcePdfPath, '.pdf'),
    page_count: pageCount,
    created_at: now,
    captured_at: now,
    updated_at: now,
    source_type: 'pdf-file',
    source: {
      capture_time: now,
      extractor: { name: 'pdf-parser', version: '1' },
      content_hash: contentHash,
    },
  };
  // optional fields are OMITTED when absent, never null (meta validator, M1)
  if (author || pdfMeta.author) meta.author = author || pdfMeta.author;
  if (meta.title === '') meta.title = '未命名文档';

  await fsp.mkdir(docDir, { recursive: true });
  await writeMeta(docDir, meta, { now });
  await fsp.writeFile(path.join(docDir, 'document.pdf'), buf);
  return { document_id: documentId, dir: docDir, meta };
}

/** Path to the document.pdf for a pdf document dir. */
export function pdfDocumentPath(docDir) {
  return path.join(docDir, 'document.pdf');
}
