/**
 * M9 real-runtime smoke (M9 §128 Case 3/9): seeds a library through the real
 * capture pipeline (loopback origin), drives the actual Electron app to click
 * the library-view "导出 EPUB" button, then re-opens the produced file with
 * the M6 reader adapter — TOC, chapter order, CJK content and assets verified.
 *
 * Run: node scripts/smoke-epub.mjs   (exits 0 on PASS, 1 on FAIL)
 */
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const importFromRoot = (...p) => import(pathToFileURL(path.join(root, ...p)).href);
const electronExe = createRequire(import.meta.url)('electron');
const PORT = 9230;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

// ---- local origin (real capture target) + seeded library
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/img.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(PNG_1PX);
  }
  const n = /^\/a(\d)$/.exec(p)?.[1];
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>归档笔记 ${n}</title></head><body>
<nav><a href="/">首页</a></nav><article><h1>归档笔记 ${n}</h1>
<p>第 ${n} 篇的正文内容：文件是唯一的真相，索引只是派生缓存。这一段足够长，可以满足正文提取器的要求，也让导出的书拥有真实的段落。</p>
<p>溪谷会留在页边。深夜的灯光、纸的重量、翻页的声音，这些都是阅读的一部分。</p>
<img src="/img.png" alt="图"/>
</article></body></html>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-smoke-'));
const env = {
  ...process.env,
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
  REVERIE_ALLOW_PRIVATE_NETWORK: '1',
};
process.env.REVERIE_LIBRARY = env.REVERIE_LIBRARY;
process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1'; // loopback origin for seeding
const { runCapture } = await importFromRoot('src', 'capture', 'pipeline.js');
for (const n of [1, 2, 3]) {
  const cap = await runCapture({ url: `${origin}/a${n}` }, { libraryRoot: env.REVERIE_LIBRARY });
  if (cap.status !== 'completed') { console.log(`FAIL seed a${n}: ${cap.status}`); process.exit(1); }
}
const destDir = path.join(tmp, 'export-out');
await fsp.mkdir(destDir, { recursive: true });

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
    this.dialogs = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Page.javascriptDialogOpening') {
        this.dialogs.push(msg.params.message);
        this.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
        return;
      }
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

// pre-authorize the export directory dialog: the app's own dialog is replaced
// in tests via the pickExportDir override below (renderer stubs it directly).
const child = launch();
const target = await findPageTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable'); // capture+dismiss native alert()s and record their text

await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= 3`, 20000, 'library rendered');
check('app launches with 3 captured articles', true);

// stub the native directory picker (CDP can't drive native dialogs) via the
// explicit app.js test hook, then click
await cdp.eval(`window.__reverieExportDirPicker = async () => ${JSON.stringify(destDir)};`);
await cdp.eval(`document.getElementById('btn-export-view-epub').click();`);
// wait for either success hint or a dismissed alert (Node-side dialogs list)
{
  const t0 = Date.now();
  for (;;) {
    if (cdp.dialogs.length > 0) break;
    const ok = await cdp.eval(`document.getElementById('queue-hint').textContent.includes('已导出')`).catch(() => false);
    if (ok) break;
    if (Date.now() - t0 > 30000) {
      console.log('DEBUG hint:', await cdp.eval(`document.getElementById('queue-hint').textContent`).catch(() => 'eval-err'));
      console.log('DEBUG ids:', await cdp.eval(`(typeof currentViewArticleIds !== 'undefined') ? currentViewArticleIds.length : 'no-var'`).catch(() => 'eval-err'));
      console.log('DEBUG btn:', await cdp.eval(`JSON.stringify({ hidden: document.getElementById('btn-export-view-epub').hidden, text: document.getElementById('btn-export-view-epub').textContent })`).catch(() => 'eval-err'));
      throw new Error('waitUntil timeout: export finished');
    }
    await sleep(400);
  }
}
const dialogsSeen = cdp.dialogs.slice();
const hint = await cdp.eval(`document.getElementById('queue-hint').textContent`);
check('无阻塞告警对话框', dialogsSeen.length === 0, dialogsSeen.join(' | ').slice(0, 200));
const outPath = /已导出：(.+?)（/.exec(hint)?.[1];
check('UI 批量导出完成（3 篇合并为一本书）', Boolean(outPath) && hint.includes('3 章'), hint.slice(0, 120));

await cdp.close();
await killTree(child);

// ---- verify the artifact outside the app: M6 reader + assets (Case 9)
const { openBookSession } = await importFromRoot('src', 'reader', 'epub-reader-core.js');
const session = await openBookSession(outPath);
check('M6 Reader 打开 M9 产物：题名页 + 3 章', session.chapters.length === 4, `chapters: ${session.chapters.length}`);
// order = the CURRENT VIEW's display order (captured desc = newest first) —
// the export preserves exactly what the user saw in the list (M9 §68)
check('章节顺序 = 视图显示顺序（稳定，M9 §68）',
  session.chapters.slice(1).map((c) => c.title).join(',') === ['归档笔记 3', '归档笔记 2', '归档笔记 1'].join(','),
  session.chapters.map((c) => c.title).join(','));
check('CJK 正文完整', session.chapters[1].text.includes('文件是唯一的真相'));
check('图片已本地化嵌入 EPUB', (await fsp.readFile(outPath)).includes(PNG_1PX));
check('TOC 可解析', session.toc.length >= 3, `toc: ${session.toc.length}`);

server.close();
console.log(failCount === 0 ? `\nM9 SMOKE: ALL ${passCount} CHECKS PASSED` : `\nM9 SMOKE: ${failCount} FAILURE(S)`);
process.exit(failCount === 0 ? 0 : 1);
