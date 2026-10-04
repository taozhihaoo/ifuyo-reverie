import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fetchUrl, FetchError, FETCH_LIMITS, assertPublicHost } from '../../src/capture/fetch.js';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '../../src/capture/protocol.js';
import { fetchAndParse } from '../../src/feed/feed-service.js';
import { FeedParseError } from '../../src/feed/feed-parser.js';
import { sanitizeArticleHtml } from '../../src/security/sanitize-html.js';
import { htmlToMarkdown } from '../../src/article/markdown.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m4net-'));

async function startServer() {
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const send = (code, body, type = 'application/xml', extra = {}) => {
      res.writeHead(code, { 'content-type': type, ...extra });
      res.end(body);
    };
    if (p === '/ok') return send(200, '<rss version="2.0"><channel><title>OK</title></channel></rss>');
    if (p === '/etag') {
      if (req.headers['if-none-match'] === '"v1"') { res.writeHead(304, { etag: '"v1"' }); return res.end(); }
      return send(200, '<rss version="2.0"><channel><title>ETag</title></channel></rss>', 'application/xml', { etag: '"v1"' });
    }
    if (p === '/last-modified') {
      if (req.headers['if-modified-since'] === 'Tue, 06 Oct 2026 00:00:00 GMT') { res.writeHead(304, { 'last-modified': 'Tue, 06 Oct 2026 00:00:00 GMT' }); return res.end(); }
      return send(200, '<rss version="2.0"><channel><title>LM</title></channel></rss>', 'application/xml', { 'last-modified': 'Tue, 06 Oct 2026 00:00:00 GMT' });
    }
    if (p === '/r1') { res.writeHead(301, { location: '/r2' }); return res.end(); }
    if (p === '/r2') { res.writeHead(302, { location: '/ok' }); return res.end(); }
    if (p === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end(); }
    if (p === '/to-localhost') { res.writeHead(302, { location: 'http://localhost:9/x' }); return res.end(); }
    if (p === '/to-private') { res.writeHead(302, { location: 'http://192.168.1.1/x' }); return res.end(); }
    if (p === '/404') return send(404, 'gone');
    if (p === '/410') return send(410, 'gone forever');
    if (p === '/429') return send(429, 'rate limited');
    if (p === '/500') return send(500, 'boom');
    if (p === '/503') return send(503, 'unavailable');
    if (p === '/hang') return; // never respond
    if (p === '/huge') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      for (let i = 0; i < 7; i++) res.write('x'.repeat(1024 * 1024));
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1'; // test server lives on loopback
const { server, origin } = await startServer();
process.on('exit', () => server.close());

const get = async (p, opts = {}) => {
  try {
    const r = await fetchUrl(`${origin}${p}`, { limits: { ...FETCH_LIMITS, timeoutMs: 1500 }, ...opts });
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, code: err.code ?? 'NETWORK_ERROR', message: err.message, error: err };
  }
};

test('200 / 304 / multi-redirect work (M4 §63/64/55)', async () => {
  const ok = await get('/ok');
  assert.equal(ok.ok, true);
  assert.equal(ok.status, 200);

  const etag1 = await get('/etag');
  assert.equal(etag1.notModified, false);
  assert.equal(etag1.etag, '"v1"');
  const etag2 = await get('/etag', { headers: { 'if-none-match': '"v1"' } });
  assert.equal(etag2.notModified, true);

  const lm1 = await get('/last-modified');
  const lm2 = await get('/last-modified', { headers: { 'if-modified-since': lm1.lastModified } });
  assert.equal(lm2.notModified, true);

  const redirected = await get('/r1', { allowPrivateNetwork: ['127.0.0.1'] }); // server host allowlisted, policy still revalidates hops
  assert.equal(redirected.finalUrl, `${origin}/ok`);
});

test('redirect loop is bounded (M4 §55)', async () => {
  const r = await get('/loop');
  assert.equal(r.ok, false);
  assert.match(r.message, /too many redirects/);
});

test('redirect revalidates policy: localhost / private IP refused (M4 §57)', async () => {
  const local = await get('/to-localhost', { allowPrivateNetwork: ['127.0.0.1'] }); // server allowlisted, redirect target revalidated
  assert.equal(local.code, 'SECURITY_REJECTED');
  assert.match(local.message, /loopback|private/);
  const priv = await get('/to-private', { allowPrivateNetwork: ['127.0.0.1'] });
  assert.equal(priv.code, 'SECURITY_REJECTED');
  assert.match(priv.message, /private/);
});

test('HTTP status classes surface typed messages (M4 §63)', async () => {
  for (const p of ['/404', '/410', '/429', '/500', '/503']) {
    const r = await get(p);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NETWORK_ERROR');
    assert.match(r.message, new RegExp(`HTTP ${p.slice(1)}`));
  }
});

test('timeout produces NETWORK_ERROR, not a hang (M4 §54)', async () => {
  const r = await get('/hang', { limits: { ...FETCH_LIMITS, timeoutMs: 600, maxRedirects: 5, maxBytes: 1e7 } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NETWORK_ERROR');
});

test('oversized response rejected with clear message (M4 §58)', async () => {
  const r = await get('/huge', { limits: { ...FETCH_LIMITS, timeoutMs: 8000, maxBytes: 5 * 1024 * 1024, maxRedirects: 5 } });
  assert.equal(r.ok, false);
  assert.match(r.message, /exceeds/);
});

test('cancellation: aborted fetch stops immediately (M4 §68)', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 150);
  const t0 = Date.now();
  let result;
  try {
    result = await fetchUrl(`${origin}/hang`, { limits: { ...FETCH_LIMITS, timeoutMs: 20000 }, signal: controller.signal });
    result = { ok: true };
  } catch (err) {
    result = { ok: false, code: err.code };
  }
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, `should cancel fast, took ${elapsed}ms`);
  assert.equal(result.ok, false);
});

test('assertPublicHost blocks every private range (M4 §57)', () => {
  const saved = process.env.REVERIE_ALLOW_PRIVATE_NETWORK;
  delete process.env.REVERIE_ALLOW_PRIVATE_NETWORK;
  try {
  for (const bad of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '10.0.0.5', '192.168.1.1',
    '172.16.0.1', '172.31.255.255', '169.254.1.1', 'myserver.local', 'fd00::1', 'fe80::1']) {
    assert.throws(() => assertPublicHost(bad), null, `should reject: ${bad}`);
  }
  assert.doesNotThrow(() => assertPublicHost('example.com'));
    assert.doesNotThrow(() => assertPublicHost('feeds.example.org'));
  } finally {
    if (saved === undefined) delete process.env.REVERIE_ALLOW_PRIVATE_NETWORK; else process.env.REVERIE_ALLOW_PRIVATE_NETWORK = saved;
  }
});

// ---- HTML safety for feed content (M4 §21) ----

test('malicious feed HTML is sanitized before becoming article content', async () => {
  const evil = await fsp.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'feed', 'rss-script.xml'), 'utf8');
  const { parseFeed } = await import('../../src/feed/feed-parser.js');
  const feed = parseFeed(evil);
  const item = feed.items[0];
  const clean = await sanitizeArticleHtml(item.content);
  const md = htmlToMarkdown(clean);
  for (const bad of ['<script', 'onerror', 'onclick', 'javascript:', '<iframe']) {
    assert.equal(clean.toLowerCase().includes(bad.toLowerCase()), false, `sanitized output contains ${bad}`);
    assert.equal(md.toLowerCase().includes(bad.toLowerCase()), false, `markdown contains ${bad}`);
  }
  assert.ok(md.includes('正常文字'), 'legitimate text preserved');
  // javascript: link degrades to plain text
  assert.ok(md.includes('bad link'), 'link text preserved');
});

test('fetchAndParse rejects javascript/data URLs at the scheme gate (M4 §56)', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/xml,<rss/>', 'file:///C:/feed.xml', 'ftp://example.com/feed']) {
    try {
      await fetchAndParse(url);
      assert.fail(`should reject ${url}`);
    } catch (err) {
      assert.equal(err.code, ERROR_CODES.INVALID_URL, url);
    }
  }
});

test('fuzz: arbitrary malformed inputs never crash, always typed errors (M4 §113)', async () => {
  const inputs = [
    '', ' ', '<', '>', '<rss', '<rss><channel>', '</rss></rss>', 'null', '123',
    '<?xml version="1.0"?><rss><channel><item><title>\u0000bad</title></item></channel></rss>',
    '<rss><channel><title>' + '长'.repeat(600 * 1024) + '</title></channel></rss>',
    '<rss><channel><title>\uFEFF mixed \u2028separators</title></channel></rss>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><content type="html">',
  ];
  for (const input of inputs) {
    try {
      const { parseFeed } = await import('../../src/feed/feed-parser.js');
      const feed = parseFeed(input);
      // if it parses, items must still be well-formed domain objects
      for (const item of feed.items) assert.equal(typeof item.title, 'string');
    } catch (err) {
      assert.ok(err instanceof FeedParseError || ['PARSE_ERROR', 'UNSUPPORTED_FORMAT', 'UNSUPPORTED_DOCTYPE'].includes(err.code),
        `unexpected error type: ${err.message}`);
    }
  }
});
