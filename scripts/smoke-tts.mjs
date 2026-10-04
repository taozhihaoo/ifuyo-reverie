/**
 * M8 real-runtime smoke: drives the actual Electron app over CDP to verify
 * TTS end-to-end with the REAL Windows speech engine — voices enumerate,
 * play starts (status + segment highlight), pause/resume work, next jumps,
 * selection reading runs in its own one-shot queue, and document switch
 * stops the previous queue.
 *
 * Run: node scripts/smoke-tts.mjs   (exits 0 on PASS, 1 on FAIL)
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
const electronExe = createRequire(import.meta.url)('electron');
const PORT = 9229;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

// seed a small library through the real ingestion path
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m8-smoke-'));
const env = {
  ...process.env,
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
};
process.env.REVERIE_LIBRARY = env.REVERIE_LIBRARY;
process.env.REVERIE_HOME = env.REVERIE_HOME; // out-of-band index ops must not pollute the dev real index
process.env.REVERIE_SEARCH_INDEX = env.REVERIE_SEARCH_INDEX;
const { addPdfBook } = await importFromRoot('src', 'reader', 'pdf-library.js');
await addPdfBook(env.REVERIE_LIBRARY, path.join(root, 'tests', 'fixtures', 'pdf', 'text.pdf'), { title: 'smoke-text' });
await addPdfBook(env.REVERIE_LIBRARY, path.join(root, 'tests', 'fixtures', 'pdf', 'outline.pdf'), { title: 'smoke-outline' });
const { rebuildIndex } = await importFromRoot('src', 'library', 'index.js');
await rebuildIndex(env.REVERIE_LIBRARY);

function launch() {
  const child = spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'],
  });
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

const child = launch();
const target = await findPageTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');

await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= 2`, 20000, 'library rendered');

// open the PDF
await cdp.eval(`
  (() => {
    const li = [...document.querySelectorAll('#article-list li')]
      .find(x => x.querySelector('.a-title')?.textContent === 'smoke-text');
    li.click();
  })();
`);
await waitUntil(cdp, `document.querySelectorAll('#reader-content .pdf-page').length === 5`, 20000, 'pdf pages mounted');

// TTS controls appear and voices enumerate
await waitUntil(cdp, `document.getElementById('tts-controls').hidden === false`, 10000, 'tts controls visible');
await waitUntil(cdp, `document.getElementById('tts-voice').options.length >= 2`, 10000, 'voices populated');
const voiceInfo = await cdp.eval(`({
  options: [...document.getElementById('tts-voice').options].map(o => o.textContent),
  engineVoices: speechSynthesis.getVoices().length,
})`);
check('TTS controls visible with engine voices populated', voiceInfo.engineVoices >= 1 && voiceInfo.options.length >= 2,
  JSON.stringify(voiceInfo));

// play → speaking (status shows sentence progress, segment highlight paints)
await cdp.eval(`document.getElementById('tts-play').click()`);
await waitUntil(cdp, `/第 \\d+ \\/ \\d+ 句/.test(document.getElementById('tts-status').textContent)`, 10000, 'speaking status');
const playState = await cdp.eval(`({
  status: document.getElementById('tts-status').textContent,
  play: document.getElementById('tts-play').textContent,
  hl: (() => { const h = CSS.highlights.get('reverie-tts'); return h ? h.size : 0; })(),
})`);
check('play starts: status shows sentence progress + play button becomes pause + segment highlight',
  playState.play === '⏸' && playState.hl >= 1, JSON.stringify(playState));

// pause → 已暂停; resume → speaking again
await cdp.eval(`document.getElementById('tts-play').click()`);
await waitUntil(cdp, `document.getElementById('tts-status').textContent === '已暂停'`, 5000, 'paused');
await cdp.eval(`document.getElementById('tts-play').click()`);
await waitUntil(cdp, `/第 \\d+ \\/ \\d+ 句/.test(document.getElementById('tts-status').textContent)`, 5000, 'resumed');
check('pause/resume cycle works', true);

// next → cursor advances
const before = await cdp.eval(`document.getElementById('tts-status').textContent`);
await cdp.eval(`document.getElementById('tts-next').click()`);
await sleep(800);
const after = await cdp.eval(`document.getElementById('tts-status').textContent`);
check('next advances to the following sentence', before !== after, `${before} → ${after}`);

// selection reading through the real selection popup
await cdp.eval(`
  (async () => {
    for (let i = 0; i < 5; i++) { globalThis.ReveriePdf.scrollToPage(i); await new Promise(r => setTimeout(r, 100)); }
    globalThis.ReverieTtsView.stopForNavigation();
  })();
`);
await sleep(600);
await cdp.eval(`
  (() => {
    const content = document.getElementById('reader-content');
    const text = ReaderAnchor.textIndex(content).text;
    const idx = text.indexOf('indexes are disposable');
    const range = ReaderAnchor.rangeForOffsets(content, idx, idx + 'indexes are disposable'.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    content.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })();
`);
await waitUntil(cdp, `!document.getElementById('selection-popup').hidden`, 5000, 'selection popup');
await cdp.eval(`document.getElementById('popup-read').click()`);
await waitUntil(cdp, `document.getElementById('tts-status').textContent === '朗读所选'`, 5000, 'selection reading');
check('selection → 朗读所选 runs a one-shot queue', true);

// document switch stops the queue
await cdp.eval(`
  (() => {
    const li = [...document.querySelectorAll('#article-list li')]
      .find(x => x.querySelector('.a-title')?.textContent === 'smoke-outline');
    li.click();
  })();
`);
await waitUntil(cdp, `document.querySelectorAll('#reader-content .pdf-page').length === 4`, 15000, 'outline pdf opened');
await sleep(800);
const switchState = await cdp.eval(`({
  status: document.getElementById('tts-status').textContent,
  hl: (() => { const h = CSS.highlights.get('reverie-tts'); return h ? h.size : 0; })(),
})`);
check('document switch stops previous TTS (no stale status/highlight)',
  switchState.status === '' && switchState.hl === 0, JSON.stringify(switchState));

// stop button ends cleanly on this document
await cdp.eval(`document.getElementById('tts-play').click()`);
await sleep(500);
await cdp.eval(`document.getElementById('tts-stop').click()`);
await sleep(300);
const stopState = await cdp.eval(`({ status: document.getElementById('tts-status').textContent })`);
check('stop clears status', stopState.status === '', JSON.stringify(stopState));

await cdp.close();
await killTree(child);

console.log(failCount === 0 ? `\nM8 SMOKE: ALL ${passCount} CHECKS PASSED` : `\nM8 SMOKE: ${failCount} FAILURE(S)`);
process.exit(failCount === 0 ? 0 : 1);
