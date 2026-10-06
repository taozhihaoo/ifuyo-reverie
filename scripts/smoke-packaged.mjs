import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const root = process.cwd();
const exe = path.join(root, 'artifacts', 'Reverie-1.0.0-portable-win-x64', 'Reverie.exe');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-pack-verify-'));
const env = { ...process.env, REVERIE_HOME: path.join(tmp, 'home'), REVERIE_LIBRARY: path.join(tmp, 'library'), REVERIE_SEARCH_INDEX: path.join(tmp, 'si.json'), REVERIE_ALLOW_PRIVATE_NETWORK: '1' };
const { createServer } = await import('node:http');
const server = createServer((req, res) => { res.writeHead(200, {'content-type':'text/html'}); res.end('<html><head><title>打包验证</title></head><body><article><h1>打包验证</h1><p>打包版端到端验证正文，足够长以让正文提取器接受这段内容为一个完整的文章段落块。</p></article></body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/p`;
let pass = 0, fail = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? '  -- ' + d : ''}`); ok ? pass++ : fail++; };

// 1. launch packaged app → auto-register should write HKCU keys
const app = spawn(exe, ['--remote-debugging-port=9245'], { env, stdio: ['ignore','ignore','ignore'] });
const { execFile } = await import('node:child_process');
const REG_KEY = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.reverie.capture_host';
const regQuery = () => new Promise(r => execFile('reg', ['query', REG_KEY, '/ve'], (e, o) => r(String(o ?? ''))));
let regOut = '';
for (let i = 0; i < 30; i++) {
  regOut = await regQuery();
  if (regOut.includes('com.reverie.capture_host.json')) break;
  await sleep(1000);
}
check('注册表已自注册（Chrome）', regOut.includes('com.reverie.capture_host.json'), regOut.trim().split('\n').pop()?.trim() || '(key missing)');
const manifestPath = regOut.split('REG_SZ').pop()?.trim();
// packaging wipes resources/app/native-host/data but the registry key may
// survive from a previous run — poll until the app has (re)written the file
let manifest = '';
for (let i = 0; i < 20 && manifestPath; i++) {
  manifest = await fsp.readFile(manifestPath, 'utf8').catch(() => '');
  if (manifest.includes(`chrome-extension://`)) break;
  await sleep(1000);
}
const manifestOk = manifest.includes(`chrome-extension://`) && manifest.includes(exe.split('\\').join('\\\\'));
check('manifest 指向打包版 Reverie.exe', manifestOk, manifestPath ?? '(none)');

// 2. CDP: wait ready, count cards
async function findPage(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const t = await (await fetch('http://127.0.0.1:9245/json/list')).json();
      const p = t.find(x => x.type === 'page' && x.url.includes('index.html'));
      if (p) return p;
    } catch {}
    await sleep(1000);
  }
  throw new Error('no page target');
}
const target = await findPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result?.result?.value); pending.delete(m.id); } });
const evalIn = (expression) => new Promise((res, rej) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); setTimeout(() => rej(new Error('eval timeout')), 15000); });
for (let i = 0; i < 20; i++) { try { if (await evalIn(`document.getElementById('article-list') !== null`)) break; } catch {} await sleep(500); }
const before = await evalIn(`document.querySelectorAll('#article-list .lib-row').length`);
check('打包版应用空库启动', before === 0, `rows=${before}`);

// 3. capture via the PACKAGED exe as host (browser simulation, CRLF pad expected)
const { EXTENSION_ID } = await import(pathToFileURL(path.join(root, 'src/capture/native-host.js')).href);
const payload = Buffer.from(JSON.stringify({ protocol_version: 1, request_id: randomUUID(), url: pageUrl, title: '打包验证', source: 'browser', capture_mode: 'article' }));
const head = Buffer.alloc(4); head.writeUInt32LE(payload.length, 0);
const host = spawn(exe, [`chrome-extension://${EXTENSION_ID}/`], { env, stdio: ['pipe','pipe','pipe'] });
let buf = Buffer.alloc(0); const frames = [];
const hostDone = new Promise((res) => {
  host.stdout.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 4) return;
      const len = buf.readUInt32LE(0);
      if (len > 1048576) return res(['MISALIGNED', buf.subarray(0,12).toString('hex')]);
      if (buf.length < 4 + len) return;
      frames.push(JSON.parse(buf.subarray(4, 4 + len).toString('utf8')));
      buf = buf.subarray(4 + len);
      if (frames.at(-1)?.status) return res(frames.at(-1));
    }
  });
});
host.stdin.write(Buffer.concat([head, payload]));
host.stdin.end();
const resp = await Promise.race([hostDone, sleep(15000).then(() => ['TIMEOUT'])]);
check('宿主经打包 exe 返回 ACCEPTED（含对齐填充）', resp?.status === 'accepted', JSON.stringify(resp).slice(0, 120));

// 4. live appearance
let ok = false, detail = '';
for (let i = 0; i < 24; i++) {
  try { if (await evalIn(`document.querySelectorAll('#article-list .lib-row').length >= 1`)) { ok = true; break; } } catch {}
  await sleep(500);
}
detail = (await evalIn(`(document.querySelector('#article-list .lib-row')?.textContent ?? '').slice(0, 60)`));
check('运行中的打包版应用实时显示文章', ok && /打包验证/.test(detail), detail);

ws.close(); server.close();
spawn('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
spawn('taskkill', ['/pid', String(host.pid), '/T', '/F'], { stdio: 'ignore' });
await sleep(2000);
await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
console.log(`\n${fail === 0 ? 'PACKAGED VERIFY: ALL PASS' : 'FAILURES'}: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
