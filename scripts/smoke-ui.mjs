/**
 * Post-1.0 UI smoke: theme switching (light/dark + accents), language
 * switching (zh/en), and dark-mode reader rendering — driven against the
 * real Electron app. Run: node scripts/smoke-ui.mjs
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
const electronExe = createRequire(pathToFileURL(path.join(root, 'x.js')).href)('electron');
const PORT = 9238;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

// ---- seed library (one real capture) before launching the app
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-ui-smoke-'));
const env = {
  ...process.env,
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
};
process.env.REVERIE_LIBRARY = env.REVERIE_LIBRARY;
process.env.REVERIE_HOME = env.REVERIE_HOME;
process.env.REVERIE_SEARCH_INDEX = env.REVERIE_SEARCH_INDEX;
process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1'; // loopback origin for seeding
process.env.REVERIE_HOME = env.REVERIE_HOME;
process.env.REVERIE_SEARCH_INDEX = env.REVERIE_SEARCH_INDEX;
const { createCaptureRequest } = await importFromRoot('src', 'capture', 'protocol.js');
const { enqueue } = await importFromRoot('src', 'capture', 'queue.js');
const { processQueue } = await importFromRoot('src', 'capture', 'worker.js');
const { rebuildIndex } = await importFromRoot('src', 'library', 'index.js');
const { createServer } = await import('node:http');
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<html><head><title>主题验证</title></head><body><article><h1>主题验证</h1><p>界面外观切换验证正文：色彩柔和、主题可切换、支持中英文。这一段足够长以满足正文提取器对内容量的要求，让阅读器渲染出真实的段落结构。</p></article></body></html>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
await enqueue(path.join(env.REVERIE_HOME, 'queue'), createCaptureRequest({ url: `${origin}/a1` }));
await processQueue({ queueDir: path.join(env.REVERIE_HOME, 'queue'), libraryRoot: env.REVERIE_LIBRARY });
await rebuildIndex(env.REVERIE_LIBRARY);

function launch() {
  return spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'],
  });
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
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('app page target not found');
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
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
await cdp.send('Page.enable');
await cdp.eval(`window.__smokeErrors = [];
  window.addEventListener('error', (e) => window.__smokeErrors.push('E: ' + String(e.message).slice(0, 200)));
  window.addEventListener('unhandledrejection', (e) => window.__smokeErrors.push('R: ' + String(e.reason?.message ?? e.reason).slice(0, 200)));`);

// 1. default theme + accent + language
// reset persisted appearance first — the smoke itself flips theme/lang in
// later steps and localStorage survives across runs (shared userData)
await cdp.eval(`localStorage.removeItem('reverie.theme'); localStorage.removeItem('reverie.accent'); localStorage.removeItem('reverie.lang'); location.reload();`);
await waitUntil(cdp, `document.getElementById('article-list') !== null`, 20000, 'app booted (after reset)');
const themeState = await cdp.eval(`({
  theme: document.documentElement.dataset.theme,
  accent: document.documentElement.dataset.accent,
  bg: getComputedStyle(document.body).backgroundColor,
  lang: document.documentElement.lang,
})`);
// default = 'system' theme: resolves to light or dark following the OS
// scheme — assert self-consistency (resolved theme ↔ palette), not daylight
check('默认 system 主题自洽 + 雾蓝强调色 + 中文',
  ['light', 'dark'].includes(themeState.theme)
  && themeState.bg === (themeState.theme === 'dark' ? 'rgb(31, 34, 42)' : 'rgb(246, 244, 240)')
  && themeState.accent === 'mist' && themeState.lang === 'zh-CN', JSON.stringify(themeState));

// 2. open article → content renders (light theme)
await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= 1`, 20000, 'library rows rendered').catch(async (e) => {
  console.log('DEBUG:', JSON.stringify({
    rows: await cdp.eval(`document.querySelectorAll('#article-list li').length`).catch(() => '?'),
    listHtml: (await cdp.eval(`document.getElementById('article-list').innerHTML`).catch(() => '')).slice(0, 200),
    errors: await cdp.eval(`window.__smokeErrors || 'none'`).catch(() => '?'),
    lists: await cdp.eval(`(async () => { const l = await window.reverie.libraryList(); const v = await window.reverie.libraryView({ view: 'all' }); const s = await window.reverie.searchQuery('主题验证'); return { list: l.entries.length, view: v.results.length, search: s.total }; })()`).catch((e) => 'eval-err ' + e.message),
  }));
  throw e;
});
await cdp.eval(`(() => { const li = [...document.querySelectorAll('#article-list li')][0]; li.click(); })();`);
await waitUntil(cdp, `document.getElementById('reader-view').hidden === false && document.getElementById('reader-content').textContent.length > 50`, 15000, 'reader opened (light)');
const lightReader = await cdp.eval(`getComputedStyle(document.getElementById('reader-content')).color`);
check('浅色主题下阅读器正文渲染', lightReader !== '', lightReader);

// 3. dark theme switch (body tokens change; reader stays readable)
await cdp.eval(`document.getElementById('sel-theme').value = 'dark';
  document.getElementById('sel-theme').dispatchEvent(new Event('change'));`);
await sleep(300);
const darkState = await cdp.eval(`({
  theme: document.documentElement.dataset.theme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  contentLen: document.getElementById('reader-content').textContent.length,
})`);
check('深色主题切换生效', darkState.theme === 'dark' && darkState.contentLen > 50, JSON.stringify(darkState));

// 4. accent switch
await cdp.eval(`document.querySelector(".accent-dot[data-accent='sage']").click();`);
await sleep(300);
const accentVal = await cdp.eval(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`);
check('强调色切换生效（苔绿）', accentVal.includes('147') || accentVal === '#93bd9b', accentVal);

// 5. language switch to English re-renders static UI
await cdp.eval(`document.getElementById('sel-lang').value = 'en';
  document.getElementById('sel-lang').dispatchEvent(new Event('change'));`);
await sleep(400);
const enState = await cdp.eval(`({
  lang: document.documentElement.lang,
  viewAll: document.querySelector('#sidebar button[data-view="all"]').textContent.trim(),
  reindex: document.getElementById('btn-reindex').textContent,
  back: document.getElementById('btn-back').textContent,
})`);
check('切换 English：静态界面文案切换', enState.lang === 'en' && enState.viewAll.startsWith('All')
  && enState.reindex === 'Rebuild index' && enState.back.includes('Back'), JSON.stringify(enState));

// 6. language persists after reload
await cdp.eval(`window.location.reload()`);
await waitUntil(cdp, `document.documentElement.lang === 'en'`, 10000, 'lang persisted after reload');
const persisted = await cdp.eval(`document.querySelector('#sidebar button[data-view="all"]').textContent.trim()`);
check('语言选择在页面重载后保持', persisted.startsWith('All'), persisted);

// 7. switch back to zh
await cdp.eval(`document.getElementById('sel-lang').value = 'zh';
  document.getElementById('sel-lang').dispatchEvent(new Event('change'));`);
await sleep(400);
const backZh = await cdp.eval(`({ lang: document.documentElement.lang, viewAll: document.querySelector('#sidebar button[data-view="all"]').textContent.trim() })`);
check('切回中文正常', backZh.lang === 'zh-CN' && backZh.viewAll.includes('全部资料'), JSON.stringify(backZh));

await cdp.close();
await killTree(child);
server.close();

console.log(failCount === 0 ? `\nUI SMOKE: ALL ${passCount} CHECKS PASSED` : `\nUI SMOKE: ${failCount} FAILURE(S)`);
process.exit(failCount === 0 ? 0 : 1);
