/**
 * Post-1.0 capture-live smoke: the exact "right-click → Save page to
 * Reverie" chain against a RUNNING app — browser sends a native-messaging
 * frame → host enqueues → the app's queue watcher processes it within
 * seconds (no restart). Regression for: "captured while the app was open,
 * the list stayed empty". Run: node scripts/smoke-capture-live.mjs
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const importFromRoot = (...p) => import(pathToFileURL(path.join(root, ...p)).href);
const electronExe = createRequire(pathToFileURL(path.join(root, 'x.js')).href)('electron');
const PORT = 9240;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  ok ? passCount++ : failCount++;
};

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-cap-live-'));
const env = {
  ...process.env,
  REVERIE_LIBRARY: path.join(tmp, 'library'),
  REVERIE_HOME: path.join(tmp, 'home'),
  REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
  REVERIE_ALLOW_PRIVATE_NETWORK: '1', // loopback origin for the seeded page
};
const queueDir = path.join(env.REVERIE_HOME, 'queue');

const { EXTENSION_ID } = await importFromRoot('src', 'capture', 'native-host.js');
const { RESPONSE_STATUSES, PROTOCOL_VERSION } = await importFromRoot('src', 'capture', 'protocol.js');

// ---- the page the "browser" will save
const { createServer } = await import('node:http');
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<html><head><title>实时采集验证</title></head><body><article><h1>实时采集验证</h1><p>应用运行期间右键保存网页，文章应当数秒内出现在列表中，无需重启应用。这一段足够长以满足正文提取器对内容量的要求，让阅读器渲染出真实的段落结构。</p></article></body></html>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/live`;

function launch() {
  return spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'],
  });
}
async function killTree(child) {
  if (!child || child.exitCode !== null) return;
  return new Promise((resolve) => {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('close', resolve);
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

// ---- launch app with an EMPTY library; wait until the UI is interactive
const child = launch();
let cdp = null;
const rendererLog = [];
try {
  const target = await findPageTarget();
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  cdp.ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      rendererLog.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      if (rendererLog.length > 12) rendererLog.shift();
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      rendererLog.push('EXC: ' + (msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').slice(0, 300));
      if (rendererLog.length > 12) rendererLog.shift();
    }
  });
  await waitUntil(cdp, `document.querySelector('#article-list') !== null`, 20000, 'app ready');
  const before = await cdp.eval(`document.querySelectorAll('#article-list .lib-row').length`);
  check('app starts with empty library', before === 0, `cards=${before}`);
  const guide = await cdp.eval(`(() => { const g = document.getElementById('setup-guide'); return g && g.hidden === false && g.textContent.includes('扩展'); })()`);
  check('empty library shows the extension setup guide', guide === true);

  // ---- act as the browser: launch the host with the extension origin and
  // send one native-messaging frame (4-byte LE length + JSON)
  const frame = (obj) => {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32LE(payload.length, 0);
    return Buffer.concat([head, payload]);
  };
  const host = spawn(electronExe, ['.', `chrome-extension://${EXTENSION_ID}/`], {
    cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let hostErr = '';
  host.stderr.on('data', (d) => { hostErr += d; });
  // Chrome-identical stream parsing: junk (launcher "\r\n") + frames; the
  // first parsed frame must be the alignment padding, the next the response
  const response = await new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const frames = [];
    let done = false;
    let timer = null;
    const armTimer = (ms, label) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish(reject, new Error(`${label}; frames=${JSON.stringify(frames)}; stderr=` + hostErr.slice(-200))), ms);
    };
    const finish = (fn, arg) => { if (done) return; done = true; clearTimeout(timer); fn(arg); };
    const pump = () => {
      for (;;) {
        if (buf.length < 4) return;
        const len = buf.readUInt32LE(0);
        if (len > 1024 * 1024) return finish(reject, new Error(`absurd frame length ${len} — stream misaligned; first bytes=${buf.subarray(0, 12).toString('hex')}`));
        if (buf.length < 4 + len) return;
        frames.push(JSON.parse(buf.subarray(4, 4 + len).toString('utf8')));
        buf = buf.subarray(4 + len);
        if (frames[0]?.reverie_padding !== true) {
          return finish(reject, new Error('first frame is not the alignment pad — launcher junk missing or pad broken: ' + JSON.stringify(frames[0])));
        }
        if (typeof frames.at(-1)?.status === 'string') return finish(resolve, frames.at(-1));
      }
    };
    const onExit = (code) => {
      // launcher exits when the node child does — its exit event can beat the
      // last pipe chunks here; grace before failing
      setTimeout(() => {
        const before = buf.length;
        pump();
        if (!done && buf.length === before) {
          finish(reject, new Error(`host exited ${code} with unparsed tail (${before}B); frames=${JSON.stringify(frames)}; stderr=` + hostErr.slice(-200)));
        }
      }, 1500);
    };
    armTimer(20000, 'host response timeout');
    host.stdout.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); pump(); });
    host.on('exit', onExit);
    host.on('error', (err) => finish(reject, err));
    host.stdin.write(frame({
      protocol_version: PROTOCOL_VERSION,
      request_id: crypto.randomUUID(),
      url: pageUrl,
      title: '实时采集验证',
      source: 'browser',
      capture_mode: 'article',
      created_at: new Date().toISOString(),
    }));
    host.stdin.end();
  });
  check('first frame is the alignment pad, response follows', response?.status === RESPONSE_STATUSES.ACCEPTED, JSON.stringify(response));
  await killTree(host);

  // ---- the fix under test: the RUNNING app picks the job up by itself
  const t0 = Date.now();
  const appeared = await waitUntil(cdp,
    `document.querySelectorAll('#article-list .lib-row').length >= 1`, 12000, 'live capture appears');
  check('article appears in the running app without restart', appeared === true, `after ${Date.now() - t0}ms`);
  const title = await cdp.eval(`(document.querySelector('#article-list .lib-row')?.textContent ?? '').slice(0, 80)`);
  check('card is the captured page', /实时采集验证/.test(title), title);

  // ---- user's real scenario: a page with NO article body (portal home like
  // baidu.com) must not vanish silently — it fails extraction and the app
  // shows a failure banner with a localized reason and a clear action
  const noArticleServer = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><head><title>门户首页</title></head><body><div><a href="/news">新闻</a><a href="/mail">邮箱</a><form><input placeholder="搜索"></form></div></body></html>');
  });
  await new Promise((r) => noArticleServer.listen(0, '127.0.0.1', r));
  const noArticleUrl = `http://127.0.0.1:${noArticleServer.address().port}/home`;
  const host2 = spawn(electronExe, ['.', `chrome-extension://${EXTENSION_ID}/`], {
    cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let host2Err = '';
  host2.stderr.on('data', (d) => { host2Err += d; });
  const resp2 = await new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error('host2 timeout; stderr=' + host2Err.slice(-200))), 20000);
    host2.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 4) return;
        const len = buf.readUInt32LE(0);
        if (buf.length < 4 + len) return;
        const msg = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
        buf = buf.subarray(4 + len);
        if (msg.status) { clearTimeout(timer); return resolve(msg); }
      }
    });
    host2.on('exit', (c) => { clearTimeout(timer); reject(new Error('host2 exited ' + c)); });
    host2.stdin.write(frame({
      protocol_version: PROTOCOL_VERSION,
      request_id: crypto.randomUUID(),
      url: noArticleUrl,
      title: '门户首页',
      source: 'browser',
      capture_mode: 'article',
      created_at: new Date().toISOString(),
    }));
    host2.stdin.end();
  });
  check('non-article page still ACCEPTED at enqueue time', resp2?.status === RESPONSE_STATUSES.ACCEPTED, JSON.stringify(resp2));
  await killTree(host2);
  const banner = await waitUntil(cdp,
    `document.getElementById('capture-failures')?.hidden === false && /采集失败|无法提取正文/.test(document.getElementById('capture-failures').textContent)`,
    15000, 'failure banner appears');
  check('failure banner appears with localized reason', banner === true,
    (await cdp.eval(`document.getElementById('capture-failures').textContent.slice(0, 120)`)));
  await cdp.eval(`document.querySelector('.capfail-clear').click()`);
  const cleared = await waitUntil(cdp,
    `document.getElementById('capture-failures')?.hidden === true`, 8000, 'banner cleared');
  const queueFilesAfter = await fsp.readdir(path.join(env.REVERIE_HOME, 'queue'));
  // failed job file must be gone; the SUCCESSFUL job is history and stays
  const failedGone = !queueFilesAfter.includes(`${resp2.request_id}.json`);
  check('clear removes failed jobs from disk', cleared === true && failedGone,
    `queue=${JSON.stringify(queueFilesAfter)} failedGone=${failedGone}`);
  noArticleServer.close();
} catch (err) {
  let diag = '';
  try {
    if (cdp) {
      const state = await cdp.eval(`JSON.stringify({
        cards: document.querySelectorAll('#article-list .lib-row').length,
        listHtml: (document.getElementById('article-list')?.innerHTML ?? '').slice(0, 200),
        visible: [...document.querySelectorAll('main > section, #library-view, [id]')].filter(e => e.offsetParent !== null && e.id).map(e => e.id).slice(0, 8),
      })`);
      diag = ' renderer=' + state + ' console=' + JSON.stringify(rendererLog.slice(-4));
    }
  } catch (e) { diag = ' diag-failed: ' + e.message; }
  let qdiag = '';
  try {
    const q = await fsp.readdir(path.join(env.REVERIE_HOME, 'queue'));
    const lib = await fsp.readdir(env.REVERIE_LIBRARY);
    qdiag = ` queue=${JSON.stringify(q)} library=${JSON.stringify(lib)}`;
  } catch (e) { qdiag = ' fsdiag-failed: ' + e.message; }
  check('capture-live flow', false, err.message + diag + qdiag);
} finally {
  cdp?.close();
  await killTree(child);
  server.close();
  await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
}
console.log(`\n${failCount === 0 ? 'ALL PASS' : 'FAILURES'}: ${passCount} pass, ${failCount} fail`);
process.exit(failCount === 0 ? 0 : 1);
