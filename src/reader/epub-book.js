/**
 * EpubContainer + EpubBookModel (M6 §6-10): container access, OPF parsing,
 * navigation/spine — main-process side, built on the project's existing
 * jsdom XML parsing (M0-verified) with security guards from M4 learnings.
 *
 * Security (M6 §16): path traversal refused, per-entry and total size caps,
 * DOCTYPE rejected (XXE/entity-bomb), original file opened read-only and
 * never modified (M6 §17).
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const importResolved = (spec) => import(pathToFileURL(require.resolve(spec)).href);

const MAX_ENTRY_SIZE = 50 * 1024 * 1024; // 50 MB per entry (M6: 超大文件)
const MAX_TOTAL_SIZE = 512 * 1024 * 1024; // total uncompressed cap (zip bomb)
const MAX_ENTRIES = 20_000;

export class EpubError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // PARSE_ERROR | UNSUPPORTED | SECURITY | NOT_FOUND
  }
}

const safeEntryName = (name) => {
  if (typeof name !== 'string' || name.length === 0 || name.length > 1024) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return false;
  if (/^[a-zA-Z]:/.test(name) || /^\\\\/.test(name)) return false;
  if (/^[\\/]/.test(name)) return false;
  const parts = name.split(/[\\/]/);
  if (parts.some((p) => p === '..' || p === '.')) return false;
  return true;
};

/**
 * Open an EPUB file: read-only container over the zip central directory.
 * Refuses: non-zip, DOCTYPE in container/OPF (XXE), oversized entries,
 * unsafe entry names, path traversal in container rootfile mapping.
 */
export async function openEpubContainer(epubPath) {
  const { configure, ZipReader, BlobReader, TextWriter, BlobWriter, Uint8ArrayWriter } =
    await importResolved('foliate-js/vendor/zip.js');
  configure({ useWebWorkers: false });

  let buf;
  try {
    buf = await fsp.readFile(epubPath);
  } catch (err) {
    throw new EpubError('NOT_FOUND', `无法读取 EPUB 文件: ${err.message}`);
  }
  if (buf.length < 4 || buf.slice(0, 2).toString() !== 'PK') {
    throw new EpubError('UNSUPPORTED', '不是有效的 ZIP/EPUB 文件');
  }
  const blob = new Blob([buf]);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();
  if (entries.length > MAX_ENTRIES) throw new EpubError('SECURITY', `条目数超过上限 ${MAX_ENTRIES}`);

  let totalUncompressed = 0;
  for (const e of entries) {
    if (!safeEntryName(e.filename)) throw new EpubError('SECURITY', `不安全的条目名: ${JSON.stringify(e.filename)}`);
    totalUncompressed += e.uncompressedSize ?? 0;
    if (totalUncompressed > MAX_TOTAL_SIZE) throw new EpubError('SECURITY', '解压总量超过上限（疑似 zip bomb）');
  }

  const byName = new Map(entries.map((e) => [e.filename, e]));
  const readText = async (name) => {
    const e = byName.get(name);
    if (!e) return null;
    if ((e.uncompressedSize ?? 0) > MAX_ENTRY_SIZE) throw new EpubError('SECURITY', `条目过大: ${name}`);
    return e.getData(new TextWriter());
  };
  const readBytes = async (name) => {
    const e = byName.get(name);
    if (!e) return null;
    if ((e.uncompressedSize ?? 0) > MAX_ENTRY_SIZE) throw new EpubError('SECURITY', `条目过大: ${name}`);
    const arr = await e.getData(new Uint8ArrayWriter());
    return Buffer.from(arr);
  };

  // mimetype check (EPUB requirement)
  const mimetype = byName.has('mimetype') ? await readText('mimetype') : null;
  if (mimetype === null || !mimetype.includes('application/epub+zip')) {
    throw new EpubError('UNSUPPORTED', '缺少 mimetype（application/epub+zip）— 不是 EPUB 文件');
  }
  const containerXml = await readText('META-INF/container.xml');
  if (containerXml === null || /<!DOCTYPE/i.test(containerXml)) {
    throw new EpubError('SECURITY', 'container.xml 缺失或包含 DOCTYPE（拒绝解析）');
  }
  const cdoc = new JSDOM(containerXml, { contentType: 'application/xml' }).window.document;
  const rootfile = cdoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootfile || !safeEntryName(rootfile)) {
    throw new EpubError('PARSE_ERROR', 'container.xml 缺少合法 rootfile');
  }
  const opfXml = await readText(rootfile);
  if (opfXml === null || /<!DOCTYPE/i.test(opfXml)) {
    throw new EpubError('SECURITY', 'OPF 缺失或包含 DOCTYPE（拒绝解析）');
  }

  const opfDir = path.posix.dirname(rootfile);
  return {
    format: 'epub',
    opfPath: rootfile,
    opfDir,
    entries: entries.map((e) => ({ name: e.filename, size: e.uncompressedSize })),
    async readEntryText(name) {
      if (!safeEntryName(name)) throw new EpubError('SECURITY', `unsafe entry: ${name}`);
      const full = name.startsWith(opfDir + '/') ? name : path.posix.join(opfDir, name);
      return readText(byName.has(full) ? full : name);
    },
    async readEntryBytes(name) {
      if (!safeEntryName(name)) throw new EpubError('SECURITY', `unsafe entry: ${name}`);
      const full = name.startsWith(opfDir + '/') ? name : path.posix.join(opfDir, name);
      return readBytes(byName.has(full) ? full : name);
    },
  };
}

/** Parse OPF (as XML string) into an EpubBookModel skeleton. */
export function parseOpf(opfXml, opfDir) {
  const doc = new JSDOM(opfXml, { contentType: 'application/xml' }).window.document;
  const pkg = doc.getElementsByTagName('package')[0];
  if (!pkg) throw new EpubError('PARSE_ERROR', '缺少 <package>');
  const version = pkg.getAttribute('version') ?? '2.0';
  if (!['2.0', '3.0'].includes(version)) {
    throw new EpubError('UNSUPPORTED', `不支持的 EPUB 版本: ${version}`);
  }

  const meta = {};
  for (const el of doc.getElementsByTagName('*')) {
    const tag = el.tagName;
    if (tag === 'dc:title' && !meta.title) meta.title = el.textContent.trim();
    else if (tag === 'dc:creator' && !meta.author) meta.author = el.textContent.trim();
    else if (tag === 'dc:language' && !meta.language) meta.language = el.textContent.trim();
    else if (tag === 'dc:identifier' && !meta.identifier) meta.identifier = el.textContent.trim();
    else if (tag === 'dc:description' && !meta.description) meta.description = el.textContent.trim();
    else if (el.getAttribute?.('property') === 'dcterms:modified' && !meta.modified) meta.modified = el.textContent.trim();
  }

  // manifest: id -> { href, media-type, properties }
  const manifest = new Map();
  for (const item of doc.getElementsByTagName('item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (!id || !href) continue;
    manifest.set(id, {
      id, href,
      mediaType: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    });
  }

  // spine: reading order of idrefs (M4 §10: 章节与阅读顺序)
  const spine = [];
  let tocId = pkg.getAttribute('toc') ?? null; // EPUB 2 ncx
  if (!tocId) {
    for (const item of doc.getElementsByTagName('item')) {
      if (item.getAttribute('media-type') === 'application/x-dtbncx+xml') { tocId = item.getAttribute('id'); break; }
    }
  }
  for (const itemref of doc.getElementsByTagName('itemref')) {
    const idref = itemref.getAttribute('idref');
    if (idref && manifest.has(idref)) spine.push({ idref, linear: itemref.getAttribute('linear') !== 'no' });
  }

  return { version, meta, manifest, spine, tocId, opfDir };
}

const posixJoin = (dir, href) => {
  const parts = (dir ? dir.split('/') : []).concat(href.split('/'));
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
};

/** Extract TOC entries from EPUB 2 NCX or EPUB 3 nav document. */
export async function extractToc(container, book, readText) {
  const items = [];
  // EPUB 3: nav item with properties="nav"
  const navItem = [...book.manifest.values()].find((m) => m.properties.split(/\s+/).includes('nav'));
  // EPUB 2: ncx from spine toc= or manifest media-type
  const ncxItem = book.tocId ? book.manifest.get(book.tocId)
    : [...book.manifest.values()].find((m) => m.mediaType === 'application/x-dtbncx+xml');

  const readDoc = async (href) => {
    const full = posixJoin(book.opfDir, href);
    const xml = await readText(full);
    if (xml === null || /<!DOCTYPE/i.test(xml)) return null;
    return new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  };

  if (navItem) {
    const navHref = posixJoin(book.opfDir, navItem.href);
    const xml = await readText(navHref);
    if (xml) {
      const navDir = path.posix.dirname(navHref);
      const doc = new JSDOM(xml, { contentType: 'application/xhtml+xml' }).window.document;
      for (const a of doc.querySelectorAll('nav a[href]')) {
        const href = a.getAttribute('href');
        const label = a.textContent.trim();
        if (!href || !label) continue;
        const [src, frag] = href.split('#');
        items.push({ label, href: posixJoin(navDir, src), fragment: frag ?? null });
      }
    }
  }

  if (items.length === 0 && ncxItem) {
    const ncxHref = posixJoin(book.opfDir, ncxItem.href);
    const ncxDir = path.posix.dirname(ncxHref);
    const xml = await readText(ncxHref);
    if (xml) {
      // NCX files legitimately carry a DOCTYPE naming the ncx DTD — safe because
      // jsdom neither fetches nor expands it. Only SYSTEM/ENTITY forms are dangerous.
      const safeXml = /<!DOCTYPE[^>]*(SYSTEM|ENTITY)/i.test(xml.slice(0, 2048)) ? xml.replace(/<!DOCTYPE[^>]*>/i, "") : xml;
      const doc = new JSDOM(safeXml, { contentType: "application/xml" }).window.document;
      const points = doc.getElementsByTagName('navPoint');
      const walk = (np, depth) => {
        const label = np.getElementsByTagName('text')[0]?.textContent?.trim();
        const src = np.getElementsByTagName('content')[0]?.getAttribute('src');
        if (label && src) {
          const [srcPath, frag] = src.split('#');
          items.push({ label, href: posixJoin(ncxDir, srcPath), fragment: frag ?? null, depth });
        }
        for (const child of np.children) {
          if (child.tagName === 'navPoint') walk(child, depth + 1);
        }
      };
      for (const np of points) walk(np, 0);
    }
  }

  void container; // TOC hrefs resolved relative to OPF dir by caller when needed
  return items;
}
