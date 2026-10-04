/**
 * M7 real-runtime smoke (M7 §100): launches the actual Electron app against a
 * seeded library and drives its renderer over the DevTools protocol — open a
 * PDF from the library, verify lazy page rendering + live DOM/canonical text
 * parity, create a highlight through the real selection popup, persist
 * reading progress, then restart the app and verify both are restored.
 *
 * Run: node scripts/smoke-pdf.mjs
 * (spawns its own electron; exits 0 on PASS, 1 on FAIL)
 */
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const importFromRoot = (...p) => import(pathToFileURL(path.join(root, ...p)).href);
// require('electron') outside an Electron runtime resolves to the executable path
const electronExe = createRequire(import.meta.url)('electron');
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

// ---------------------------------------------------------------- env/seeds
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m7-smoke-'));
const env = {
  ...process.env,
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
};
await fsp.mkdir(env.REVERIE_LIBRARY, { recursive: true });

// seed with the real ingestion path (main-process modules)
process.env.REVERIE_LIBRARY = env.REVERIE_LIBRARY;
const { addPdfBook } = await importFromRoot('src', 'reader', 'pdf-library.js');
const seeded = await addPdfBook(env.REVERIE_LIBRARY, path.join(root, 'tests', 'fixtures', 'pdf', 'text.pdf'), { title: 'smoke-text' });
const seededOutline = await addPdfBook(env.REVERIE_LIBRARY, path.join(root, 'tests', 'fixtures', 'pdf', 'outline.pdf'), { title: 'smoke-outline' });

// canonical text of the seeded PDF, computed the same way main computes it
const { openPdfDocument, closePdfDocument, extractPdfPages, pdfCanonicalText } = await importFromRoot('src', 'reader', 'pdf-reader-core.js');
const tmpDoc = await openPdfDocument(seeded.dir + path.sep + 'document.pdf');
const seededPages = await extractPdfPages(tmpDoc);
await closePdfDocument(tmpDoc);
const canonical = pdfCanonicalText(seededPages);
const quote = 'indexes are disposable';
const quoteIdx = canonical.indexOf(quote);
const quoteEnd = quoteIdx + quote.length;
if (quoteIdx === -1) { console.log('FAIL seed quote missing'); process.exit(1); }

// build the derived index the way the app's own 重建索引 does
const { rebuildIndex } = await importFromRoot('src', 'library', 'index.js');
await rebuildIndex(env.REVERIE_LIBRARY);

// ---------------------------------------------------------------- CDP client
function launch() {
  const child = spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function killTree(child) {
  if (!child || child.exitCode !== null) return;
  return new Promise((resolve) => {
    const p = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    p.on('close', resolve);
    setTimeout(resolve, 3000);
  });
}

async function findPageTarget(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('app page target not found on CDP');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  get ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === 1) return resolve();
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }
  /** Evaluate an async expression in the page and return its value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error('page eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    }
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function waitUntil(cdp, expression, timeoutMs = 15000, label = '') {
  const t0 = Date.now();
  for (;;) {
    const v = await cdp.eval(expression).catch(() => false);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`waitUntil timeout: ${label || expression}`);
    await sleep(400);
  }
}

// ---------------------------------------------------------------- phase 1
let child = launch();
const target = await findPageTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');

await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= 2`, 20000, 'library rendered');
check('app launches, library lists seeded PDFs', true);

// open the text PDF
await cdp.eval(`
  (() => {
    const li = [...document.querySelectorAll('#article-list li')]
      .find(x => x.querySelector('.a-title')?.textContent === 'smoke-text');
    li.click();
  })();
`);
await waitUntil(cdp, `document.querySelectorAll('#reader-content .pdf-page').length === 5`, 20000, 'pdf pages mounted');
await waitUntil(cdp, `document.querySelector('#reader-content canvas') !== null`, 20000, 'first page canvas rendered');
// text layers are lazy: walk every page once so the whole DOM text exists
await cdp.eval(`
  (async () => {
    for (let i = 0; i < 5; i++) {
      globalThis.ReveriePdf.scrollToPage(i);
      await new Promise((r) => setTimeout(r, 120));
    }
  })();
`);
await waitUntil(cdp, `document.querySelectorAll('#reader-content .pdf-text-layer span').length >= 120`, 20000, 'all text layers built');
const textLayers = await cdp.eval(`document.querySelectorAll('#reader-content .pdf-text-layer span').length`);
check('PDF opens in Reader Shell: 5 pages mounted, canvas renders, text layers built', textLayers >= 120, `${textLayers} text spans`);

// live DOM/canonical parity through the REAL IPC + renderer path
const domText = await cdp.eval(`ReaderAnchor.textIndex(document.getElementById('reader-content')).text`);
check('live parity: renderer DOM text === main canonical text', domText === canonical,
  domText === canonical ? `${domText.length} chars` : `len ${domText?.length} vs ${canonical.length}`);

// toolbar state: walk left the viewport mid-document — return to page 1 first
await cdp.eval(`(() => { globalThis.ReveriePdf.scrollToPage(0); })()`);
await sleep(700);
const indicator = await cdp.eval(`({ cur: document.getElementById('pdf-cur').textContent, total: document.getElementById('pdf-total').textContent })`);
check('page indicator shows 1 / 5', indicator.cur === '1' && indicator.total === '5', JSON.stringify(indicator));

// highlight through the real selection popup
await cdp.eval(`
  (() => {
    const content = document.getElementById('reader-content');
    const range = ReaderAnchor.rangeForOffsets(content, ${quoteIdx}, ${quoteEnd});
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    content.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })();
`);
await waitUntil(cdp, `!document.getElementById('selection-popup').hidden`, 5000, 'selection popup');
await cdp.eval(`document.getElementById('popup-highlight').click()`);
await waitUntil(cdp, `document.getElementById('annotation-count').textContent === '1'`, 8000, 'annotation count');
const highlightCss = await cdp.eval(`
  (() => { const h = CSS.highlights.get('reverie-hl'); return h ? h.size : 0; })()
`);
check('selection → popup → highlight created and painted via CSS Custom Highlight', highlightCss >= 1, `highlights: ${highlightCss}`);

// reading progress: jump to page 3 (index), wait for the debounced write
await cdp.eval(`globalThis.ReveriePdf.scrollToPage(3, 0.2)`);
await sleep(1200);
const progressProbe = await cdp.eval(`({
  cur: document.getElementById('pdf-cur').textContent,
  scrollY: Math.round(window.scrollY),
  loc: globalThis.ReveriePdf.progressFromDom(),
})`);
const stateFile = path.join(env.REVERIE_LIBRARY, 'user-state.json'); // user state lives in-library (M3 §7)
let saved = null;
try {
  saved = JSON.parse(await fsp.readFile(stateFile, 'utf8')).states[seeded.meta.document_id]?.last_location;
} catch { /* not written yet */ }
check('reading progress persisted (page_index unit)', saved?.page_index === 3,
  `saved=${JSON.stringify(saved)} probe=${JSON.stringify(progressProbe)}`);

await cdp.close();
await killTree(child);
await sleep(1500);

// ---------------------------------------------------------------- phase 2 (restart)
child = launch();
const target2 = await findPageTarget();
const cdp2 = new Cdp(target2.webSocketDebuggerUrl);
await cdp2.ready;
await cdp2.send('Runtime.enable');

await waitUntil(cdp2, `document.querySelectorAll('#article-list li').length >= 2`, 20000, 'library rendered (restart)');
await cdp2.eval(`
  (() => {
    const li = [...document.querySelectorAll('#article-list li')]
      .find(x => x.querySelector('.a-title')?.textContent === 'smoke-text');
    li.click();
  })();
`);
await waitUntil(cdp2, `document.querySelectorAll('#reader-content .pdf-page').length === 5`, 20000, 'pdf pages mounted (restart)');
await sleep(1000); // progress restore runs on rAF after layout

const cur2 = await cdp2.eval(`document.getElementById('pdf-cur').textContent`);
check('restart: reading position restored to page 4 (index 3)', cur2 === '4', `indicator: ${cur2}`);

const annCount2 = await cdp2.eval(`document.getElementById('annotation-count').textContent`);
check('restart: highlight restored from annotations.jsonl', annCount2 === '1', `count: ${annCount2}`);

// highlight paints again after its page's text layer builds
await sleep(800);
const highlightCss2 = await cdp2.eval(`
  (() => { const h = CSS.highlights.get('reverie-hl'); return h ? h.size : 0; })()
`);
check('restart: highlight re-painted on the text layer', highlightCss2 >= 1, `highlights: ${highlightCss2}`);

// in-document search through the TOC panel
await cdp2.eval(`document.getElementById('btn-toc').click()`);
await cdp2.eval(`
  const input2 = document.getElementById('book-search');
  input2.value = 'disposable';
  input2.dispatchEvent(new Event('input'));
`);
await waitUntil(cdp2, `document.querySelectorAll('#book-search-results .bs-hit').length > 0`, 5000, 'in-doc search results');
await cdp2.eval(`document.querySelector('#book-search-results .bs-hit').click()`);
await sleep(600);
const tocHidden = await cdp2.eval(`document.getElementById('book-toc').hidden`);
check('in-document search jumps to the matching page', tocHidden === true);

// outline document smoke: open the outline PDF and check TOC entries
await cdp2.eval(`
  (() => {
    const li = [...document.querySelectorAll('#article-list li')]
      .find(x => x.querySelector('.a-title')?.textContent === 'smoke-outline');
    li.click();
  })();
`);
await waitUntil(cdp2, `document.querySelectorAll('#reader-content .pdf-page').length === 4`, 15000, 'outline pdf pages');
await cdp2.eval(`document.getElementById('btn-toc').click()`);
const tocTexts = await cdp2.eval(`[...document.querySelectorAll('#book-toc-list button')].map(b => b.textContent)`);
check('outline renders as nested TOC', tocTexts.some((t) => t.includes('第一部分')) && tocTexts.some((t) => t.includes('第一章')), JSON.stringify(tocTexts.slice(0, 4)));

await cdp2.close();
await killTree(child);

console.log(failCount === 0 ? `\nM7 SMOKE: ALL ${passCount} CHECKS PASSED` : `\nM7 SMOKE: ${failCount} FAILURE(S)`);
process.exit(failCount === 0 ? 0 : 1);
