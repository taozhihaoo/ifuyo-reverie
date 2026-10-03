/**
 * Node-side foliate-js loader (EPUB Spike).
 * foliate-js is browser-first; in Node we inject jsdom's DOM globals and
 * reuse its vendored zip.js. This is exactly the isolation boundary the
 * future EPUB Adapter needs — nothing here leaks into Folio code.
 */
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const importResolved = (spec) => import(pathToFileURL(require.resolve(spec)).href);

export function installDomGlobals() {
  const w = new JSDOM().window;
  const globals = ['DOMParser', 'XMLSerializer', 'DOMException', 'ProcessingInstruction',
    'Element', 'Document', 'Text', 'Comment', 'CDATASection', 'DocumentFragment',
    'Node', 'NodeFilter', 'XPathResult'];
  for (const k of globals) {
    if (w[k] !== undefined && globalThis[k] === undefined) globalThis[k] = w[k];
  }
  return w;
}

export async function openEpub(epubPath) {
  installDomGlobals();
  const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } =
    await importResolved('foliate-js/vendor/zip.js');
  const { EPUB } = await importResolved('foliate-js/epub.js');
  configure({ useWebWorkers: false });

  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(epubPath);
  const reader = new ZipReader(new BlobReader(new Blob([buf])));
  const entries = await reader.getEntries();
  const map = new Map(entries.map((e) => [e.filename, e]));
  const load = (f) => (name, ...args) => (map.has(name) ? f(map.get(name), ...args) : null);
  const loader = {
    entries,
    loadText: load((e) => e.getData(new TextWriter())),
    loadBlob: load((e, type) => e.getData(new BlobWriter(type))),
    getSize: (name) => map.get(name)?.uncompressedSize ?? 0,
  };
  const book = await new EPUB(loader).init();
  return { book, loader };
}
