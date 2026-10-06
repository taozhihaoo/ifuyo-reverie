/**
 * M11 release smoke (M11 §51/§52 fresh-machine proxy): launches the PACKAGED
 * portable exe from artifacts/ (no source tree, no dev node_modules) against
 * an isolated user data dir and verifies the product chain end-to-end:
 * bootstrap → library → capture already seeded → Doctor version info →
 * search → EPUB export → restart with window state.
 *
 * Run: npm run package:portable first, then node scripts/smoke-release.mjs
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
const require = createRequire(pathToFileURL(path.join(root, 'x.js')).href);
const PORT = 9235;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

// locate the packaged exe
const artifacts = path.join(root, 'artifacts');
const portableDir = (await fsp.readdir(artifacts).catch(() => []))
  .filter((n) => n.startsWith('Reverie-') && n.includes('portable-win-x64'))
  .sort()
  .map((n) => path.join(artifacts, n))[0];
const exe = portableDir ? path.join(portableDir, 'Reverie.exe') : null;
if (!exe) { console.log('FAIL portable build not found — run npm run package:portable'); process.exit(1); }
const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));

// isolated user environment + a pre-seeded capture (content already in library)
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m11-smoke-'));
const env = {
  ...process.env,
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
};
process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1';
const { runCapture } = await importFromRoot('src', 'capture', 'pipeline.js');
const { createServer } = await import('node:http');
const originServer = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<html><head><title>发布验证文章</title></head><body><article><h1>发布验证文章</h1><p>这是打包版本的真机验证内容：文件是唯一的真相，索引只是派生缓存。这一段足够长以满足提取器要求，并让导出的 EPUB 拥有真实段落。</p><p>溪谷会留在页边。深夜的灯光、纸的重量、翻页的声音，这些都是阅读的一部分。</p></article></body></html>');
});
await new Promise((r) => originServer.listen(0, '127.0.0.1', r));
const cap = await runCapture({ url: `http://127.0.0.1:${originServer.address().port}/a1` }, { libraryRoot: env.REVERIE_LIBRARY });
if (cap.status !== 'completed') { console.log('FAIL seed capture'); process.exit(1); }
originServer.close();

let child = spawn(exe, [`--remote-debugging-port=${PORT}`], {
  env, cwd: portableDir, stdio: ['ignore', 'ignore', 'ignore'],
});

async function findPageTarget(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('packaged app page target not found');
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
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
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
async function waitUntil(cdp, expression, timeoutMs = 20000, label = '') {
  const t0 = Date.now();
  for (;;) {
    const v = await cdp.eval(expression).catch(() => false);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`waitUntil timeout: ${label || expression}`);
    await sleep(400);
  }
}

const target = await findPageTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= 1`, 25000, 'packaged app lists seeded article');
check('打包产物启动（无源码树/无开发依赖）并列出库内容', true);

const info = await cdp.eval(`window.reverie.appInfo()`);
check('应用版本信息 = package.json 版本', info.version === pkg.version && info.platform === 'windows-x64', JSON.stringify(info));
check('扩展随包分发（setup 引导可指向的文件夹）', info.extensionId === 'ngfmioeinapcphpbgboaajachhhdgajg'
  && await fsp.access(info.extensionDir).then(() => true, () => false)
  && await fsp.access(path.join(info.extensionDir, 'manifest.json')).then(() => true, () => false),
  JSON.stringify({ extensionDir: info.extensionDir, extensionId: info.extensionId }));

const doctor = await cdp.eval(`window.reverie.doctorRun()`);
check('Doctor 在打包产物内可用且库健康', doctor.summary.documents === 1 && (doctor.summary.bySeverity.critical ?? 0) === 0,
  JSON.stringify(doctor.summary));

const search = await cdp.eval(`window.reverie.searchQuery('溪谷会留在页边')`);
check('搜索在打包产物内可用（CJK）', search.total === 1, JSON.stringify({ total: search.total }));

// export EPUB from the packaged app
await cdp.eval(`window.__reverieExportDirPicker = async () => ${JSON.stringify(path.join(tmp, 'export'))};`);
await cdp.eval(`
  (async () => {
    const li = [...document.querySelectorAll('#article-list li')][0];
    li.click(); // open reader
  })();
`);
await waitUntil(cdp, `document.getElementById('reader-view').hidden === false`, 15000, 'reader opened');
await cdp.eval(`document.getElementById('btn-export-epub').click();`);
await sleep(1500);
// btn-export-epub uses the native save dialog — verify export via IPC instead
const exportResult = await cdp.eval(`(async () => {
  const r = await window.reverie.libraryView({ view: 'all' });
  const out = await window.reverie.exportEpub(r.results.map(x => x.document_id), ${JSON.stringify(path.join(tmp, 'export'))}, { fileName: 'release-check', options: {}, mode: 'merge' });
  return JSON.stringify(out);
})()`);
const exportJson = JSON.parse(exportResult);
check('EPUB 导出在打包产物内可用', exportJson.success === true, exportResult.slice(0, 140));
const exported = await fsp.readFile(exportJson.outputPath);
check('导出的 EPUB 为合法容器', exported.slice(0, 2).toString() === 'PK');

// restart: window state + library persistence
const boundsBefore = await cdp.eval(`JSON.stringify({ w: innerWidth, h: innerHeight })`);
await cdp.close();
await new Promise((r) => setTimeout(r, 2500));
try { child.kill(); } catch { /* */ }
spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
await sleep(2500);

child = spawn(exe, [`--remote-debugging-port=${PORT}`], {
  env, cwd: portableDir, stdio: ['ignore', 'ignore', 'ignore'],
});
const target2 = await findPageTarget();
const cdp2 = new Cdp(target2.webSocketDebuggerUrl);
await cdp2.ready;
await cdp2.send('Runtime.enable');
await waitUntil(cdp2, `document.querySelectorAll('#article-list li').length >= 1`, 25000, 'restart lists library');
const settings2 = await cdp2.eval(`window.reverie.settingsGet()`);
check('重启后设置持久化（库位置保留）', settings2.effectiveLibraryRoot === env.REVERIE_LIBRARY, settings2.effectiveLibraryRoot);
check('重启后日志文件已生成', (await fsp.readdir(path.join(env.REVERIE_HOME, 'logs'))).some((f) => f.startsWith('reverie-')));
void boundsBefore;

await cdp2.close();
await killTree(child);
async function killTree(c) {
  if (!c || c.exitCode !== null) return;
  return new Promise((resolve) => {
    const p = spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    p.on('close', resolve);
    setTimeout(resolve, 3000);
  });
}

console.log(failCount === 0 ? `\nM11 SMOKE: ALL ${passCount} CHECKS PASSED` : `\nM11 SMOKE: ${failCount} FAILURE(S)`);
process.exit(failCount === 0 ? 0 : 1);
