import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from 'node:http';
import { runCapture } from '../../src/capture/pipeline.js';
import { createCaptureRequest, RESPONSE_STATUSES } from '../../src/capture/protocol.js';
// local test HTTP servers live on loopback — explicit test policy (M4 §57)
process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-dup-'));

const page = (title, canonical, extra) =>
  `<html><head><title>${title}</title>${canonical ? `<link rel="canonical" href="${canonical}">` : ''}</head>` +
  `<body><article><h1>${title}</h1>${extra}</article></body></html>`;

const PARAS = Array.from({ length: 6 }, (_, i) =>
  `<p>第${i + 1}段：归档的意义在于多年以后还能找回当时划过的重点，文件是唯一的真相${i}。</p>`).join('');

async function startServer() {
  const server = createServer((req, res) => {
    const p = new URL(req.url, 'http://x');
    if (p.pathname === '/dup') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page('重复测试', '/dup-canonical', PARAS));
    }
    if (p.pathname === '/dup-canonical' || p.pathname === '/mirror') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page('重复测试', '/dup-canonical', PARAS));
    }
    if (p.pathname === '/mutating') {
      const v = p.searchParams.get('v') ?? '0';
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page(`变化页面 v${v}`, null, PARAS + `<p>版本标记：v${v}，这一段让内容不同。</p>`));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const { server, origin } = await startServer();
process.on('exit', () => server.close());

test('Case 1: same URL captured twice -> second is duplicate of the first', async () => {
  const lib = await tmpdir();
  const first = await runCapture(createCaptureRequest({ url: `${origin}/dup` }), { libraryRoot: lib });
  assert.equal(first.status, RESPONSE_STATUSES.COMPLETED);
  const second = await runCapture(createCaptureRequest({ url: `${origin}/dup` }), { libraryRoot: lib });
  assert.equal(second.status, RESPONSE_STATUSES.DUPLICATE, JSON.stringify(second));
  assert.equal(second.article_id, first.article_id);
});

test('Case 2: same URL, different query order -> still duplicate', async () => {
  const lib = await tmpdir();
  const first = await runCapture(createCaptureRequest({ url: `${origin}/dup?a=1&b=2` }), { libraryRoot: lib });
  assert.equal(first.status, RESPONSE_STATUSES.COMPLETED);
  const second = await runCapture(createCaptureRequest({ url: `${origin}/dup?b=2&a=1` }), { libraryRoot: lib });
  assert.equal(second.status, RESPONSE_STATUSES.DUPLICATE);
  assert.equal(second.article_id, first.article_id);
});

test('Case 3: different original URLs, same canonical + same content -> duplicate', async () => {
  const lib = await tmpdir();
  const first = await runCapture(createCaptureRequest({ url: `${origin}/dup?via=rss` }), { libraryRoot: lib });
  assert.equal(first.status, RESPONSE_STATUSES.COMPLETED);
  const second = await runCapture(createCaptureRequest({ url: `${origin}/mirror` }), { libraryRoot: lib });
  assert.equal(second.status, RESPONSE_STATUSES.DUPLICATE, JSON.stringify(second));
  assert.equal(second.article_id, first.article_id);
});

test('Case 4: same URL, changed content -> legitimate NEW capture, old untouched', async () => {
  const lib = await tmpdir();
  const v1 = await runCapture(createCaptureRequest({ url: `${origin}/mutating?v=1` }), { libraryRoot: lib });
  assert.equal(v1.status, RESPONSE_STATUSES.COMPLETED);
  const v2 = await runCapture(createCaptureRequest({ url: `${origin}/mutating?v=2` }), { libraryRoot: lib });
  assert.equal(v2.status, RESPONSE_STATUSES.COMPLETED, JSON.stringify(v2));
  assert.notEqual(v2.article_id, v1.article_id);

  const year = new Date().getFullYear();
  const dirs = await fsp.readdir(path.join(lib, 'articles', String(year)));
  assert.equal(dirs.filter((d) => !d.startsWith('.')).length, 2);
  // both articles remain readable
  for (const d of dirs) {
    const md = await fsp.readFile(path.join(lib, 'articles', String(year), d, 'article.md'), 'utf8');
    assert.ok(md.length > 50);
  }
});
