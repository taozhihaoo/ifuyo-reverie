/**
 * EPUB export service (M9) — the ExportCoordinator. Gathers documents from
 * LIBRARY FILES (meta.json + article.md + annotations.jsonl + assets/), builds
 * via epub-builder, zips via the shared STORE writer, validates (string gates
 * + a real M6-reader round-trip), then writes atomically
 * (output.epub.tmp → validate → rename). Source files are read-only here —
 * the whole flow never writes into the library (M9 §58).
 */
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeZip } from '../../core/zip-writer.js';
import { readMeta } from '../../core/meta.js';
import { readAnnotationsFile } from '../../annotation/store.js';
import { openEpubContainer, parseOpf } from '../../reader/epub-book.js';
import { buildEpub } from './epub-builder.js';
import { validateEpubBuffer } from './epub-exporter.js';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif']);

export class ExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExportError';
    this.code = code; // input|content|resource|serialization|packaging|validation|io|cancelled
  }
}

const throwIfCancelled = (signal) => {
  if (signal?.aborted) throw new ExportError('cancelled', '导出已取消');
};

/** Collect one document's export inputs from library files (read-only). */
async function collectDocument(libraryRoot, entry, { includeHighlights, includeNotes }) {
  const dir = path.join(libraryRoot, entry.path);
  const meta = await readMeta(dir);
  const markdown = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
  let annotations = [];
  if (includeHighlights || includeNotes) {
    try {
      const raw = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
      annotations = raw.annotations
        .filter((a) => a.type === 'highlight' || a.type === 'note')
        .map((a) => ({
          type: a.type,
          quotedText: a.quoted_text ?? '',
          note: a.note ?? '',
          createdAt: a.created_at ?? '',
        }));
    } catch { /* no annotations file → none */ }
  }
  return {
    documentId: meta.document_id,
    title: meta.title,
    author: meta.author ?? null,
    publishedAt: meta.published_at ?? null,
    sourceUrl: meta.source?.canonical_url ?? meta.source?.original_url ?? null,
    lang: meta.language ?? 'zh-CN',
    markdown,
    annotations,
    dir,
  };
}

/** Read one referenced asset; missing/unreadable file → null (warned upstream). */
async function readAsset(docDir, sourceRef) {
  const p = path.join(docDir, sourceRef);
  const ext = path.extname(p).slice(1).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return null;
  try {
    return await fsp.readFile(p);
  } catch {
    return null; // §23: image failure is a warning, never an export failure
  }
}

/**
 * Validate a built EPUB buffer: M5 string gates + a REAL M6-reader round-trip
 * (container/OPF/spine must parse back; M9 §32/§33).
 */
export async function validateBuiltEpub(buffer, { expectedChapters = null } = {}) {
  const basic = validateEpubBuffer(buffer);
  if (!basic.ok) {
    throw new ExportError('validation', `EPUB 结构校验失败: ${basic.errors.join('；')}`);
  }
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-'));
  const tmpPath = path.join(tmpDir, 'validate.epub');
  try {
    await fsp.writeFile(tmpPath, buffer);
    const container = await openEpubContainer(tmpPath);
    const opfXml = await container.readEntryText(container.opfPath);
    const opf = parseOpf(opfXml, container.opfDir);
    if (expectedChapters != null && opf.spine.length < expectedChapters) {
      throw new ExportError('validation', `spine 章节数 (${opf.spine.length}) 少于预期 (${expectedChapters})`);
    }
  } catch (err) {
    if (err instanceof ExportError) throw err;
    throw new ExportError('validation', `M6 Reader 回读失败: ${err.message}`);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
  return { ok: true };
}

/**
 * Export one or many documents as an EPUB (merged book when >1).
 * @returns {Promise<{success:true, outputPath, documentCount, chapterCount,
 *   assetCount, assetsFailed, skipped, warnings, identifier, durationMs}>}
 */
export async function exportDocumentsToEpub({
  libraryRoot,
  entries, // [{document_id, path, title}] from the library index
  destDir,
  fileName,
  options = {},
  signal,
} = {}) {
  const t0 = Date.now();
  const {
    includeImages = true,
    includeHighlights = false,
    includeNotes = false,
    generateToc = true,
    bookTitle = null,
    author = null,
    now = null, // injectable for deterministic tests (dcterms:modified source)
  } = options;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ExportError('input', '未选择要导出的文档');
  }
  throwIfCancelled(signal);

  // de-dup by document id (M9 §69), keep caller order (stable, §68)
  const seen = new Set();
  const uniqueEntries = [];
  for (const e of entries) {
    if (seen.has(e.document_id)) continue;
    seen.add(e.document_id);
    uniqueEntries.push(e);
  }

  // ---- collect (document-level failures degrade to skipped, §42/§79)
  const documents = [];
  const skipped = [];
  for (const entry of uniqueEntries) {
    throwIfCancelled(signal);
    try {
      const doc = await collectDocument(libraryRoot, entry, { includeHighlights, includeNotes });
      if (!doc.markdown || doc.markdown.trim().length === 0) {
        skipped.push({ document_id: entry.document_id, title: entry.title ?? doc.title, reason: '正文为空' });
        continue;
      }
      documents.push(doc);
    } catch (err) {
      if (err instanceof ExportError && err.code === 'cancelled') throw err;
      skipped.push({ document_id: entry.document_id, title: entry.title, reason: err.message });
    }
  }

  // ---- build (throws on empty/structural problems → whole-export failure)
  const build = buildEpub(documents, {
    bookTitle: bookTitle ?? null,
    author: author ?? null,
    includeImages,
    includeHighlights,
    includeNotes,
    generateToc,
    ...(now ? { now } : {}),
  });

  // ---- attach asset bytes (missing files become warnings + image dropped)
  let assetsFailed = 0;
  for (const asset of build.assets.values()) {
    throwIfCancelled(signal);
    const buf = await readAsset(asset.doc.dir, asset.sourceRef);
    if (buf) {
      asset.buffer = buf;
    } else {
      assetsFailed += 1;
      asset.dropped = true;
      build.warnings.push(`图片文件缺失: ${asset.sourceRef}`);
    }
  }
  const assetList = [...build.assets.values()].filter((a) => a.buffer && !a.dropped);
  const droppedKeys = new Set([...build.assets.values()].filter((a) => a.dropped).map((a) => a.key));

  const zipEntries = build.files.map((f) => {
    if (f.name === 'OEBPS/content.opf' && droppedKeys.size > 0) {
      // strip manifest lines of assets whose bytes were unavailable, so the
      // manifest never claims a resource the zip does not carry (M9 §29)
      let xml = f.data.toString('utf8');
      for (const key of droppedKeys) {
        xml = xml.replace(new RegExp(`<item id="img-${key.slice(0, 16)}"[^>]*/>\\n?`), '');
      }
      return { ...f, data: Buffer.from(xml) };
    }
    return f;
  }).concat(assetList.map((a) => ({ name: `OEBPS/${a.zipPath}`, data: a.buffer })));

  const zip = makeZip(zipEntries);
  await validateBuiltEpub(zip, { expectedChapters: build.chapterCount });
  throwIfCancelled(signal);

  // ---- atomic write (M9 §31): tmp → validate → rename; failures clean up
  await fsp.mkdir(destDir, { recursive: true });
  const safeName = (fileName || build.title || 'reverie-export')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 120) || 'reverie-export';
  const outputPath = path.join(destDir, `${safeName}.epub`);
  const tmpPath = `${outputPath}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tmpPath, zip);
    await fsp.rename(tmpPath, outputPath);
  } catch (err) {
    await fsp.rm(tmpPath, { force: true }); // §43/§94: no half EPUBs left behind
    throw new ExportError('io', `写出 EPUB 失败: ${err.message}`);
  }

  return {
    success: true,
    outputPath,
    documentCount: documents.length,
    skipped,
    chapterCount: build.chapterCount,
    assetCount: assetList.length,
    assetsFailed,
    warnings: build.warnings,
    identifier: build.identifier,
    durationMs: Date.now() - t0,
  };
}
