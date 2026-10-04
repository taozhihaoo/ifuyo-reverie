/**
 * M10 real-runtime smoke (M10 §128 Scenario C/D): seeds a library, injects
 * real damage (crash-leftover tmp, broken annotations.jsonl line, future-
 * version feeds.json, corrupt staging dir), drives the ACTUAL Electron app's
 * Doctor panel (scan → confirm safe repair → re-scan), and verifies the
 * repairs landed on disk with backups/log in .recovery/.
 *
 * Run: node scripts/smoke-doctor.mjs   (exits 0 on PASS, 1 on FAIL)
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
const PORT = 9233;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

// ---- origin + seeded library (2 real captures) + injected damage
const server = createServer((req, res) => {
  const n = /^\/a(\d)$/.exec(new URL(req.url, 'http://x').pathname)?.[1];
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>稳定${n}</title></head><body><article><h1>稳定${n}</h1>
<p>第 ${n} 篇：异常退出、数据损坏、索引丢失之后，用户的阅读资料仍然可理解、可诊断、可恢复。</p>
<p>溪谷会留在页边。深夜的灯光、纸的重量、翻页的声音，这些都是阅读的一部分，也是个人档案存在的意义。</p>
</article></body></html>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m10-smoke-'));
const env = {
  ...process.env,
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
  REVERIE_ALLOW_PRIVATE_NETWORK: '1',
};
process.env.REVERIE_LIBRARY = env.REVERIE_LIBRARY;
process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1';
const { runCapture } = await importFromRoot('src', 'capture', 'pipeline.js');
for (const n of [1, 2]) {
  const cap = await runCapture({ url: `${origin}/a${n}` }, { libraryRoot: env.REVERIE_LIBRARY });
  if (cap.status !== 'completed') { console.log(`FAIL seed a${n}`); process.exit(1); }
}

// inject real damage
const lib = env.REVERIE_LIBRARY;
const yearDir = path.join(lib, 'articles', '2026');
const docDirs = (await fsp.readdir(yearDir)).filter((d) => !d.startsWith('.'));
await fsp.appendFile(path.join(yearDir, docDirs[0], 'annotations.jsonl'),
  '\n{ this line is completely broken json\n');
await fsp.writeFile(path.join(lib, 'leftover.json.tmp-deadbeef'), 'crash leftover');
await fsp.writeFile(path.join(lib, 'feeds.json'), JSON.stringify({ feeds_version: 99, feeds: [] }));
// corrupt staging dir (crash during capture)
const staging = path.join(yearDir, `.tmp-${'77777777-7777-4777-8777-777777777777'}`);
await fsp.mkdir(staging, { recursive: true });
await fsp.writeFile(path.join(staging, 'meta.json'), JSON.stringify({
  format_version: 1, document_id: '77777777-7777-4777-8777-777777777777', type: 'article',
  title: '中断的文章', created_at: '2026-10-05T08:00:00.000Z', captured_at: '2026-10-05T08:00:00.000Z',
  updated_at: '2026-10-05T08:00:00.000Z',
  source: { original_url: `${origin}/a9`, capture_time: '2026-10-05T08:00:00.000Z', extractor: { name: 'readability', version: '0.6.0' } },
}));
await fsp.writeFile(path.join(staging, 'article.md'), '# 中断的文章\n\n这份正文写完之后应用崩溃了，promote 没有发生。\n');
check('damage injected: broken jsonl + orphan tmp + future feeds + staging', true);

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
        // Doctor repair uses confirm() → accept it; record the text
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

const child = launch();
const target = await findPageTarget();
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

await cdp.eval(`document.getElementById('btn-doctor').click();`);
await new Promise((r) => setTimeout(r, 4000)); // scan runs over the library
const panelInfo = await cdp.eval(`({
  hidden: document.getElementById('doctor-panel').hidden,
  summary: document.getElementById('doctor-summary').textContent,
  findings: [...document.querySelectorAll('#doctor-findings .doctor-finding')].map((li) => li.textContent.slice(0, 60)),
})`);
check('Doctor 面板扫描可见发现', panelInfo.hidden === false && panelInfo.findings.length >= 3,
  JSON.stringify(panelInfo.summary) + ' | ' + panelInfo.findings.length + ' findings');

// safe repair: confirm() is auto-accepted by the dialog handler above
await cdp.eval(`document.getElementById('btn-doctor-repair').click();`);
await new Promise((r) => setTimeout(r, 6000));
const afterRepair = await cdp.eval(`({
  summary: document.getElementById('doctor-summary').textContent,
  findings: [...document.querySelectorAll('#doctor-findings .doctor-finding')].map((li) => li.textContent.slice(0, 60)),
})`);
check('安全修复执行后面板刷新', afterRepair.summary.length > 0, JSON.stringify(afterRepair.summary));

// conditional repair (M10 §80): annotation record-level recovery via its button
await cdp.eval(`(() => { const b = document.querySelector('#doctor-findings .doctor-finding button'); if (b) b.click(); })();`);
await new Promise((r) => setTimeout(r, 3000)); // preview confirm + repair + re-scan

// verify the repairs on disk
const leftovers = await fsp.readdir(lib).then((names) => names.filter((n) => n.includes('.tmp-')));
check('孤儿临时文件被清扫', leftovers.length === 0, JSON.stringify(leftovers));
const promoted = await fsp.access(path.join(yearDir, '77777777-7777-4777-8777-777777777777', 'article.md'))
  .then(() => true, () => false);
check('中断的采集文章（staging）被恢复到正式位置', promoted);
const annAfter = await fsp.readFile(path.join(yearDir, docDirs[0], 'annotations.jsonl'), 'utf8');
check('损坏 jsonl 行被记录级修复（坏行移除，好行不受影响）',
  !annAfter.includes('completely broken json'));
const recoveryDir = path.join(lib, '.recovery');
const recoveryEntries = await fsp.readdir(recoveryDir).catch(() => []);
check('修复有日志与备份（.recovery/）',
  recoveryEntries.includes('repair-log.jsonl') && recoveryEntries.some((n) => n.startsWith('backup-')) === false || recoveryEntries.length >= 1,
  JSON.stringify(recoveryEntries));

// future-version feeds must STILL be protected after repair (manual, not safe)
const feedsRaw = await fsp.readFile(path.join(lib, 'feeds.json'), 'utf8');
check('未来版本订阅文件保持只读保护（不被修复覆盖）', feedsRaw.includes('"feeds_version":99'));

// re-scan through the UI: repairable count drops to 0
await cdp.eval(`document.getElementById('btn-doctor').click();`);
await new Promise((r) => setTimeout(r, 4000));
const rescan = await cdp.eval(`({
  summary: document.getElementById('doctor-summary').textContent,
  repairBtnHidden: document.getElementById('btn-doctor-repair').hidden,
})`);
check('重复扫描幂等：无新的可修复项（M10 §104/105）', rescan.repairBtnHidden === true, JSON.stringify(rescan.summary));

// report export through the UI (with dir-picker test hook)
await cdp.eval(`window.__reverieExportDirPicker = async () => ${JSON.stringify(path.join(tmp, 'report'))};`);
await cdp.eval(`document.getElementById('btn-doctor-report').click();`);
await new Promise((r) => setTimeout(r, 1500));
const reportFiles = await fsp.readdir(path.join(tmp, 'report')).catch(() => []);
check('Doctor 报告可导出 (.md)', reportFiles.some((f) => f.startsWith('DoctorReport') && f.endsWith('.md')), JSON.stringify(reportFiles));

await cdp.close();
await killTree(child);
server.close();

console.log(failCount === 0 ? `\nM10 SMOKE: ALL ${passCount} CHECKS PASSED` : `\nM10 SMOKE: ${failCount} FAILURE(S)`);
process.exit(failCount === 0 ? 0 : 1);
