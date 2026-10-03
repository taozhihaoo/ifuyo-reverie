import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { runCapture, canonicalizeForDedupe } from '../../src/capture/pipeline.js';
import { createCaptureRequest, ERROR_CODES, RESPONSE_STATUSES } from '../../src/capture/protocol.js';


const corpusDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extraction', 'corpus');
const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-pipe-'));

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Local origin server for pipeline tests. */
async function startTestServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const send = (code, body, type = 'text/html; charset=utf-8') => {
      res.writeHead(code, { 'content-type': type });
      res.end(body);
    };
    if (p === '/blog-cn') {
      const html = await fsp.readFile(path.join(corpusDir, 'blog-cn', 'input.html'), 'utf8');
      return send(200, html.replace('href="https://blog.hillstation.example/posts/weekend-repair"', 'href="/posts/weekend-repair"'));
    }
    if (p === '/images/brake-fixed.jpg') {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(PNG_1PX);
    }
    if (p === '/posts/weekend-repair') return send(200, '<html><title>canonical target</title></html>');
    if (p === '/gbk') {
      const body = Buffer.from(
        `<html><head><meta charset="gbk"><title>GBK测试</title></head><body><article><h1>中文编码</h1><p>这段文字是GBK编码的中文，必须正确解码。</p></article></body></html>`,
        'utf8',
      );
      // actually encode to GBK via TextEncoder? TextEncoder is utf-8 only. Use iconv? No —
      // declare gbk but send utf8 would break the test. Instead serve latin1-decoded gbk bytes:
      const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); // "中文" in GBK
      res.writeHead(200, { 'content-type': 'text/html; charset=gbk' });
      return res.end(Buffer.concat([
        Buffer.from('<html><head><title>GBK</title></head><body><article><h1>'),
        gbk,
        Buffer.from('</h1><p>GBK正文内容必须被正确解码，这一段用来凑足长度。</p><p>第二段：深夜的灯光、纸的重量、翻页的声音，这些都是阅读的一部分。</p><p>第三段：归档的意义在于多年以后还能找回当时划过的重点。</p></article></body></html>'),
      ]));
    }
    if (p === '/redirect') {
      res.writeHead(302, { location: '/blog-cn' });
      return res.end();
    }
    if (p === '/ja') {
      return send(200, '<html><head><title>日本語テスト</title></head><body><article><h1>日本語の記事</h1><p>これは日本語の本文です。文字コードはUTF-8で保存されなければなりません。</p><p>読み取りアーカイブは多言語の内容を正しく保持する必要があります。</p></article></body></html>');
    }
    if (p === '/not-html') return send(200, 'just text', 'text/plain');
    if (p === '/nav-only') {
      return send(200, await fsp.readFile(path.join(corpusDir, 'nav-only', 'input.html'), 'utf8'));
    }
    if (p === '/img-fail') {
      return send(200, `<html><head><title>ImgFail</title></head><body><article><h1>图片失败</h1><p>正文第一段，图片会下载失败但是文章本身必须保存成功并且可以阅读。</p><p><img src="/missing-image.png" alt="missing"></p><p>正文第二段：数据库只是索引，文件才是唯一的真相，这一原则贯穿整个产品。</p><p>正文第三段：当一张图片下载失败时，正确的做法是记录警告而不是丢弃整篇文章。</p></article></body></html>`);
    }
    if (p === '/missing-image.png') return send(404, 'nope', 'image/png');
    if (p === '/huge') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<html><body><p>');
      const chunk = 'x'.repeat(1024 * 1024);
      for (let i = 0; i < 7; i++) res.write(chunk);
      return res.end('</p></body></html>');
    }
    if (p === '/hang') { /* never respond */ return; }
    return send(404, 'not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin };
}

// shared across this file's tests (batched, per user's "don't test frequently")
const { server, origin } = await startTestServer();
process.on('exit', () => server.close());

test('canonicalizeForDedupe: query order, tracking params, trailing slash, case', () => {
  assert.equal(
    canonicalizeForDedupe('https://Example.com/a/?b=2&a=1&utm_source=x'),
    canonicalizeForDedupe('https://example.com/a?a=1&b=2'),
  );
  assert.equal(
    canonicalizeForDedupe('https://example.com/x?fbclid=zz&id=5'),
    'https://example.com/x?id=5',
  );
  assert.equal(canonicalizeForDedupe('https://example.com/p#section'), 'https://example.com/p');
});

test('happy path: capture blog-cn -> completed article with assets, meta, source', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/blog-cn`, title: '我的周末修车记' }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.COMPLETED, JSON.stringify(result));
  assert.ok(result.article_id);

  const year = new Date().getFullYear();
  const dir = path.join(lib, 'articles', String(year), result.article_id);
  const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'));
  assert.equal(meta.type, 'article');
  assert.equal(meta.document_id, result.article_id);
  assert.equal(meta.format_version, 1);
  assert.equal(meta.title.includes('周末修车记'), true);
  assert.equal(meta.author.includes('老周'), true);
  assert.equal(meta.source.original_url, `${origin}/blog-cn`);
  assert.equal(meta.source.canonical_url, `${origin}/posts/weekend-repair`);
  assert.ok(meta.source.content_hash.startsWith('sha256-'));
  assert.equal(meta.source.extractor.name, 'readability');

  const md = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
  assert.ok(md.includes('后刹车完全失灵'));
  assert.ok(md.includes('内六角工具'));
  // image downloaded and referenced locally
  const assetRef = /assets\/[0-9a-f]{64}\.(jpg|png)/.exec(md)?.[0];
  assert.ok(assetRef, 'markdown should reference a local asset');
  const assetBuf = await fsp.readFile(path.join(dir, assetRef));
  assert.equal(assetBuf.length, PNG_1PX.length);
  // original source preserved
  const src = await fsp.readFile(path.join(dir, 'source', 'page.html'), 'utf8');
  assert.ok(src.includes('周末修车记'));
  assert.equal(result.degraded, false);
});

test('GBK page decodes correctly (charset handling)', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/gbk` }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.COMPLETED, JSON.stringify(result));
  const year = new Date().getFullYear();
  const md = await fsp.readFile(path.join(lib, 'articles', String(year), result.article_id, 'article.md'), 'utf8');
  assert.ok(md.includes('中文')); // decoded from GBK bytes
});

test('redirects are followed and final URL is recorded', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/redirect` }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.COMPLETED);
  const year = new Date().getFullYear();
  const meta = JSON.parse(await fsp.readFile(path.join(lib, 'articles', String(year), result.article_id, 'meta.json'), 'utf8'));
  assert.equal(meta.source.original_url, `${origin}/redirect`);
  assert.equal(meta.source.canonical_url, `${origin}/posts/weekend-repair`);
});

test('404 and non-HTML fail without creating any article', async () => {
  const lib = await tmpdir();
  const r404 = await runCapture(createCaptureRequest({ url: `${origin}/definitely-missing` }), { libraryRoot: lib });
  assert.equal(r404.status, RESPONSE_STATUSES.FAILED);
  assert.equal(r404.error_code, ERROR_CODES.NETWORK_ERROR);

  const rHtml = await runCapture(createCaptureRequest({ url: `${origin}/not-html` }), { libraryRoot: lib });
  assert.equal(rHtml.status, RESPONSE_STATUSES.FAILED);
  assert.equal(rHtml.error_code, ERROR_CODES.EXTRACTION_FAILED);

  const entries = await fsp.readdir(path.join(lib, 'articles'), { recursive: true }).catch(() => []);
  assert.equal(entries.filter((e) => e === 'meta.json').length, 0);
});

test('nav-only page fails with EXTRACTION_FAILED — no empty article is saved', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/nav-only` }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.FAILED);
  assert.equal(result.error_code, ERROR_CODES.EXTRACTION_FAILED);
  assert.match(result.message, /no extractable article|no article candidate/);
});

test('javascript: URLs are rejected before any network activity', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: 'javascript:alert(1)' }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.FAILED);
  assert.equal(result.error_code, ERROR_CODES.INVALID_URL);
});

test('oversized response is rejected by the size cap', async () => {
  const lib = await tmpdir();
  const result = await runCapture(
    createCaptureRequest({ url: `${origin}/huge` }),
    {
      libraryRoot: lib,
      limits: {
        timeoutMs: 5000, maxBytes: 5 * 1024 * 1024, maxRedirects: 5,
        assetTimeoutMs: 5000, assetMaxBytes: 10 * 1024 * 1024,
      },
    },
  );
  assert.equal(result.status, RESPONSE_STATUSES.FAILED);
  assert.equal(result.error_code, ERROR_CODES.NETWORK_ERROR);
  assert.match(result.message, /exceeds/);
});

test('hung server hits the timeout and fails with NETWORK_ERROR', async () => {
  const lib = await tmpdir();
  const result = await runCapture(
    createCaptureRequest({ url: `${origin}/hang` }),
    { libraryRoot: lib, limits: { timeoutMs: 500, maxBytes: 5 * 1024 * 1024, maxRedirects: 5, assetTimeoutMs: 500, assetMaxBytes: 1e6 } },
  );
  assert.equal(result.status, RESPONSE_STATUSES.FAILED);
  assert.equal(result.error_code, ERROR_CODES.NETWORK_ERROR);
});

test('Japanese (UTF-8) page round-trips without mojibake', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/ja` }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.COMPLETED, JSON.stringify(result));
  const year = new Date().getFullYear();
  const md = await fsp.readFile(path.join(lib, 'articles', String(year), result.article_id, 'article.md'), 'utf8');
  assert.ok(md.includes('日本語の本文です'));
  assert.ok(md.includes('多言語'));
});

test('asset download failure degrades but never kills the article', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/img-fail` }), { libraryRoot: lib });
  assert.equal(result.status, RESPONSE_STATUSES.COMPLETED);
  assert.equal(result.degraded, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'asset_download_failed');

  const year = new Date().getFullYear();
  const dir = path.join(lib, 'articles', String(year), result.article_id);
  const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'));
  assert.equal(meta.capture_warnings.length, 1);
  assert.equal(meta.capture_warnings[0].code, 'asset_download_failed');
  const md = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
  assert.ok(md.includes('正文第一段')); // article remains readable
});
