/**
 * Main-process PDF Reader Adapter core (M7). Opens a document.pdf from the
 * library through pdfjs-dist (Node legacy build) and projects it into
 * plain-domain data: canonical page text, metadata, outline. This is the only
 * main-process file allowed to touch the pdfjs API — third-party types never
 * leak into Library / Annotation / Search models (M7 §7).
 *
 * Canonical text contract (M7 §13, mirrors M6 §33): a page's canonical text
 * is `items.map(i => i.str).join('')` — exactly what pdf.js TextLayer puts
 * into the renderer DOM (span.textContent = item.str, EOL = <br> which adds
 * no text). Whole-book canonical = page texts joined with NO separator, the
 * same concatenation the renderer produces by stacking page sections. The
 * integration test locks this byte-for-byte on both sides.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** Typed errors for caller branching (M7 §81). */
export class PdfError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
    this.error_code = code; // dual spelling, same convention as FetchError
  }
}

export const PDF_ERROR_CODES = [
  'NOT_FOUND', 'NOT_PDF', 'CORRUPTED', 'PASSWORD_REQUIRED',
  'TOO_LARGE', 'PAGE_LIMIT', 'PARSE_ERROR',
];

/** Resource guards (M7 §14). Limits are injectable for tests. */
export const PDF_LIMITS = {
  maxFileBytes: 200 * 1024 * 1024,      // 200 MB source file
  maxPages: 20000,                      // reject million-page pathologies
  maxCanonicalChars: 20 * 1024 * 1024,  // reader canonical guard
  maxIndexBodyChars: 200 * 1024,        // scan pdf_body projection (same as book_body)
};

let pdfjsCache = null;
async function getPdfjs() {
  if (!pdfjsCache) {
    const legacy = path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'legacy', 'build', 'pdf.mjs',
    );
    pdfjsCache = await import(pathToFileURL(legacy).href);
  }
  return pdfjsCache;
}

function standardFontDataUrl() {
  const fontsDir = path.join(
    path.dirname(require.resolve('pdfjs-dist/package.json')),
    'standard_fonts',
  );
  return pathToFileURL(fontsDir.endsWith(path.sep) ? fontsDir : fontsDir + path.sep).href;
}

/**
 * Open a PDF file into a pdfjs document proxy (isolated; callers must
 * `closePdfDocument` it). Typed errors only.
 */
export async function openPdfDocument(pdfPath, limits = PDF_LIMITS) {
  let stat;
  try {
    stat = await fsp.stat(pdfPath);
  } catch {
    throw new PdfError('NOT_FOUND', `PDF 文件不存在: ${pdfPath}`);
  }
  if (stat.size > limits.maxFileBytes) {
    throw new PdfError('TOO_LARGE', `PDF 文件超过大小上限（${Math.round(limits.maxFileBytes / 1024 / 1024)} MB）`);
  }
  const head = Buffer.alloc(5);
  const fh = await fsp.open(pdfPath, 'r');
  try {
    await fh.read(head, 0, 5, 0);
  } finally {
    await fh.close();
  }
  const looksLikePdf = head.toString('latin1') === '%PDF-';

  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await fsp.readFile(pdfPath));
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false, // no PDF JavaScript, ever (M7 §14.4)
      disableFontFace: true,
      standardFontDataUrl: standardFontDataUrl(),
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new PdfError('PASSWORD_REQUIRED', '此 PDF 受密码保护，Reverie 暂不支持输入密码');
    }
    if (err?.name === 'InvalidPDFException') {
      throw new PdfError(looksLikePdf ? 'CORRUPTED' : 'NOT_PDF', 'PDF 无法解析（文件损坏或不是 PDF）');
    }
    throw new PdfError('PARSE_ERROR', `PDF 解析失败: ${err?.message ?? err}`);
  }
  if (doc.numPages > limits.maxPages) {
    await closePdfDocument(doc);
    throw new PdfError('PAGE_LIMIT', `PDF 页数超过上限（${limits.maxPages} 页）`);
  }
  return doc;
}

export async function closePdfDocument(doc) {
  try { await doc?.destroy?.(); } catch { /* already destroyed */ }
}

/** Extract info-dict metadata into plain fields (absent → null). */
export async function extractPdfMeta(doc) {
  let info = {};
  try {
    const meta = await doc.getMetadata();
    info = meta?.info ?? {};
  } catch { /* metadata optional */ }
  const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  return {
    title: clean(info.Title),
    author: clean(info.Author),
    subject: clean(info.Subject),
    keywords: clean(info.Keywords),
    creator: clean(info.Creator),
    producer: clean(info.Producer),
    creation_date: clean(info.CreationDate),
    modification_date: clean(info.ModDate),
  };
}

/**
 * Extract canonical page text + per-page geometry. Text items whose `str` is
 * undefined (marked-content boundaries never appear with default options,
 * but stay defensive) are skipped — matching the TextLayer DOM contract.
 * Page-level failures degrade to empty text for that page only (M7 §53).
 */
export async function extractPdfPages(doc, limits = PDF_LIMITS) {
  const pages = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    let text = '';
    let width = 0;
    let height = 0;
    let rotation = 0;
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        text += item.str;
      }
      const view = page.view ?? [0, 0, 0, 0];
      width = Math.round((view[2] - view[0]) * 100) / 100;
      height = Math.round((view[3] - view[1]) * 100) / 100;
      rotation = ((page.rotate ?? 0) % 360 + 360) % 360;
    } catch {
      // page-level failure: page stays present with no text (局部错误局部失败)
    }
    total += text.length;
    if (total > limits.maxCanonicalChars) {
      throw new PdfError('TOO_LARGE', `PDF 文本总量超过上限（${Math.round(limits.maxCanonicalChars / 1024 / 1024)} MB 字符）`);
    }
    pages.push({ index: i - 1, text, width, height, rotation });
  }
  return pages;
}

/** Page labels for display (null when the PDF defines none). */
export async function extractPdfPageLabels(doc) {
  try {
    const labels = await doc.getPageLabels();
    return Array.isArray(labels) ? labels : null;
  } catch {
    return null;
  }
}

/**
 * Outline → nested plain nodes {title, page_index, children}. Named dests are
 * resolved through getDestination; corrupt entries keep their title with
 * page_index = null — local failure never blocks the document (M7 §19).
 */
export async function extractPdfOutline(doc, { maxNodes = 2000, maxDepth = 16 } = {}) {
  let root = null;
  try {
    root = await doc.getOutline();
  } catch {
    return [];
  }
  if (!Array.isArray(root) || root.length === 0) return [];
  let budget = maxNodes;
  const resolvePage = async (dest) => {
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return null;
      return await doc.getPageIndex(explicit[0]);
    } catch {
      return null;
    }
  };
  const walk = async (items, depth) => {
    const out = [];
    for (const it of items) {
      if (budget-- <= 0 || depth > maxDepth) return out;
      const node = {
        title: typeof it?.title === 'string' ? it.title : '',
        page_index: await resolvePage(it?.dest),
        children: Array.isArray(it?.items) && it.items.length > 0
          ? await walk(it.items, depth + 1)
          : [],
      };
      out.push(node);
    }
    return out;
  };
  return walk(root, 0);
}

/** Canonical whole-document text: page texts joined with NO separator. */
export function pdfCanonicalText(pages) {
  return pages.map((p) => p.text).join('');
}

/**
 * Offset → page spans: [{index, start, end}] over the canonical text.
 * Both main and renderer derive the same spans from the same page lengths.
 */
export function pdfPageSpans(pages) {
  const spans = [];
  let pos = 0;
  for (const p of pages) {
    spans.push({ index: p.index, start: pos, end: pos + p.text.length });
    pos += p.text.length;
  }
  return spans;
}

export function pageForOffset(spans, offset) {
  const span = spans.find((s) => offset >= s.start && offset < s.end);
  if (span) return span.index;
  return spans.length > 0 ? spans[spans.length - 1].index : 0;
}
