/**
 * Import pipeline (M5 §7-11/§23-25): staging + validation + preview +
 * idempotent commit. External file is NEVER modified (M5 §58); user data is
 * never overwritten (M5 §23) — the only actions are create / skip.
 *
 * Provenance (M5 §11): every imported document records
 * provenance { source_type, source_item_id, source_url, imported_at,
 * import_session_id, import_key } in meta.json — survives index rebuilds,
 * which is what makes re-import idempotent even after "delete the index".
 *
 * Idempotency (M5 §10): import_key = `${source_type}:${source_id}:${source_item_id}`;
 * re-importing the same file finds the existing key and SKIPS.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { newId } from '../core/ids.js';
import { writeFileAtomic } from '../core/atomic-write.js';
import { writeMeta } from '../core/meta.js';
import { normalizeSource, detectFormat, ImportParseError, IMPORT_SOURCES } from './sources.js';
import { sanitizeArticleHtml } from '../security/sanitize-html.js';
import { htmlToMarkdown } from '../article/markdown.js';
import { scanLibrary } from '../library/scan.js';
import { canonicalizeForDedupe } from '../capture/pipeline.js';

const MAX_IMPORT_FILE = 100 * 1024 * 1024; // 100 MB input cap (M5 §73)

const sha256hex = (s) => 'sha256-' + createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** Read + detect + parse + normalize an external import file. */
export async function parseImportFile(filePath, { format = null } = {}) {
  const stat = await fsp.stat(filePath);
  if (stat.size > MAX_IMPORT_FILE) throw new ImportParseError('PARSE_ERROR', `导入文件超过 ${MAX_IMPORT_FILE} 字节上限`);
  const raw = await fsp.readFile(filePath, 'utf8');
  let json;
  try {
    json = JSON.parse(raw.replace(/^\uFEFF/, '')); // strip BOM (M5 §74)
  } catch (err) {
    throw new ImportParseError('PARSE_ERROR', `文件不是有效的 JSON: ${err.message}`);
  }
  const detected = format ?? detectFormat(json, path.basename(filePath));
  if (!detected || !IMPORT_SOURCES.includes(detected)) {
    throw new ImportParseError('UNSUPPORTED_FORMAT', '无法识别的导入格式 — 支持 Pocket / Wallabag / Raindrop 导出文件');
  }
  const records = normalizeSource(detected, json);
  return { source_type: detected, records };
}

/** Import key used for idempotency: stable per external item. */
export function importKeyOf(sourceType, record) {
  const id = record.external_id ?? (record.url ? canonicalizeForDedupe(record.url) : sha256hex(record.title ?? ''));
  return `${sourceType}:${id}`;
}

async function loadExistingDocs(libraryRoot) {
  const { loadSearchIndex } = await import('../search/search-service.js');
  const index = await loadSearchIndex(libraryRoot);
  const importKeys = new Map();
  const byCanonical = new Map();
  for (const d of index.documents) {
    if (d.import_key) importKeys.set(d.import_key, d);
    if (d.url) byCanonical.set(canonicalizeForDedupe(d.url), d);
  }
  return { importKeys, byCanonical };
}

/**
 * Preview an import WITHOUT writing: classify each record against the
 * existing library (M5 §9). Returns { source_type, rows, counts }.
 */
export async function previewImport(libraryRoot, filePath, { format = null } = {}) {
  const { source_type, records } = await parseImportFile(filePath, { format });
  const { importKeys } = await loadExistingDocs(libraryRoot);
  const rows = records.map((r) => {
    const key = importKeyOf(source_type, r);
    const exists = importKeys.has(key);
    const viable = Boolean(r.title || r.url || r.content_html || r.excerpt);
    const action = exists ? 'skip' : viable ? 'new' : 'invalid';
    return { title: r.title ?? null, url: r.url ?? null, import_key: key, action };
  });
  const counts = { total: rows.length, new: 0, skip: 0, invalid: 0 };
  for (const r of rows) counts[r.action]++;
  return { source_type, rows, counts };
}

/**
 * Commit an import: write each record as a Reverie document (staging inside
 * captureToLibrary-style write), then one index refresh at the end (M5 §68).
 * Partial failure: failures are recorded per item; successful items stay.
 */
export async function commitImport(libraryRoot, filePath, {
  format = null,
  sessionId = newId(),
  signal = null,
  onProgress = () => {},
} = {}) {
  const { source_type, records } = await parseImportFile(filePath, { format });
  const { importKeys } = await loadExistingDocs(libraryRoot);
  const startedAt = new Date().toISOString();

  const report = {
    session_id: sessionId,
    source_type,
    source_path: filePath,
    started_at: startedAt,
    completed_at: null,
    status: 'completed',
    total_items: records.length,
    created: 0, skipped: 0, updated: 0, duplicate: 0, failed: 0,
    warnings: [],
    failures: [],
    duration_ms: 0,
  };

  for (let i = 0; i < records.length; i++) {
    if (signal?.aborted) { report.status = 'cancelled'; break; }
    const r = records[i];
    const key = importKeyOf(source_type, r);
    try {
          if (importKeys.has(key)) {
        report.skipped++;
        report.duplicate++;
        continue;
      }
      if (!r.title && !r.url && !r.content_html && !r.excerpt) {
        report.failed++;
        report.failures.push({ index: i, title: r.title, error_code: 'INVALID_RECORD', message: '条目缺少 title / url / content，无法形成有效文档' });
        continue;
      }
      const doc = await writeImportedDocument(libraryRoot, source_type, r, key, sessionId);
      importKeys.set(key, { document_id: doc.document_id });
      report.created++;
      onProgress({ index: i, total: records.length, document_id: doc.document_id });
    } catch (err) {
      report.failed++;
      report.failures.push({ index: i, title: r.title, error_code: 'PERSIST_FAILED', message: err.message });
    }
  }
  // batch index update (M5 §68): one refresh per import, never per item
  try {
    const { invalidateSearchIndex, refreshSearchIndex } = await import('../search/search-service.js');
    invalidateSearchIndex();
    await refreshSearchIndex(libraryRoot);
  } catch { /* index marked stale; rebuild recovers (M5 §91) */ }
  report.completed_at = new Date().toISOString();
  report.duration_ms = Date.now() - Date.parse(startedAt);
  return report;
}

function nowIso() { return new Date().toISOString(); }

/** Write one imported record as a full Reverie document. */
async function writeImportedDocument(libraryRoot, sourceType, r, importKeyValue, sessionId, now = nowIso()) {
  const documentId = newId();
  const docDir = path.join(libraryRoot, 'articles', String(now.slice(0, 4)), documentId);

  // content: sanitized full HTML -> markdown, or excerpt as text, or URL stub
  let markdown = '';
  if (r.content_html) {
    const clean = await sanitizeArticleHtml(r.content_html);
    markdown = htmlToMarkdown(clean);
  } else if (r.excerpt) {
    markdown = `${r.excerpt}\n`;
  } else {
    markdown = `> Content not locally available.\n>\n> Source: ${r.url ?? '(no url)'}\n`;
  }
  const contentHash = sha256hex(markdown);

  const meta = {
    format_version: 1,
    document_id: documentId,
    type: 'article',
    title: r.title || r.url || '(未命名导入条目)',
    created_at: now,
    captured_at: r.created_at ?? now,
    updated_at: now,
    source: {
      capture_time: r.created_at ?? now,
      extractor: { name: 'import', version: '1' },
      content_hash: contentHash,
    },
    source_type: 'import',
    provenance: {
      source_type: sourceType,
      source_item_id: r.external_id,
      source_url: r.url ?? null,
      imported_at: now,
      import_session_id: sessionId,
      import_key: importKeyValue,
    },
    content_provenance: r.content_html ? 'import-content' : 'import-reference',
  };
  if (r.author) meta.author = r.author;
  if (r.published_at) meta.published_at = r.published_at;
  if (r.url) {
    meta.source.original_url = r.url;
    meta.source.canonical_url = canonicalizeForDedupe(r.url);
  }

  await writeMeta(docDir, meta, { now });
  await writeFileAtomic(path.join(docDir, 'article.md'), markdown);
  return { document_id: documentId, import_key: importKeyValue };
}
