/**
 * M9 Web → EPUB tests: a fresh URL goes through the REAL M1 capture pipeline
 * (against a loopback origin server, the established M1 test pattern) and
 * lands in a valid EPUB; an already-saved article exports with ZERO network
 * (offline-first, M9 §90); failed captures fail cleanly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { captureAndExportToEpub } from '../../src/importexport/export/web-to-epub.js';
import { exportDocumentsToEpub } from '../../src/importexport/export/epub-export-service.js';
import { validateBuiltEpub } from '../../src/importexport/export/epub-export-service.js';
import { openBookSession } from '../../src/reader/epub-reader-core.js';

process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1'; // loopback test servers only

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function startOriginServer() {
  const server = createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/img.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(PNG_1PX);
      return;
    }
    if (p === '/article') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><title>河上笔记</title></head><body>
<nav><a href="/">首页</a><a href="/arch">归档</a></nav>
<article><h1>河上笔记</h1>
<p>清晨的<strong>雾气</strong>贴着水面。归档的意义在于多年以后还能找回当时划过的重点，这一段用来满足正文提取器对长度的要求，同时也让导出的电子书拥有真实的段落结构。</p>
<p>溪谷会留在页边，也会留在记忆里。深夜的灯光、纸的重量、翻页的声音，这些都是阅读的一部分，也是个人档案之所以存在的原因。</p>
<h2>第二段</h2><p>文件是唯一的真相，索引只是派生缓存。数据库可以重建，缓存可以丢弃，但保存在文件夹里的文章必须始终可读。</p>
<img src="/img.png" alt="河"/>
<p>最后一段：当一张图片下载失败时，正确的做法是记录警告而不是丢弃整篇文章；当整个库需要搬迁时，只需要复制文件夹。</p>
</article></body></html>`);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

test('web → epub: fresh URL → capture (M1 pipeline) → valid EPUB with localized image', async () => {
  const { server, origin } = await startOriginServer();
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-web-'));
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  try {
    const result = await captureAndExportToEpub({
      url: `${origin}/article`,
      libraryRoot: lib,
      destDir: dest,
      fileName: '河上笔记',
      options: { now: new Date(0) },
    });
    assert.equal(result.success, true);
    assert.ok(result.documentId, 'captured document id reported');
    const epub = await fsp.readFile(result.outputPath);
    // the EPUB must be self-contained: the image bytes are INSIDE it
    assert.ok(epub.includes(PNG_1PX), 'image bytes embedded (self-contained, M9 §24)');
    await validateBuiltEpub(epub, { expectedChapters: 1 });
    // M6 reader opens the exported file (M9 §109)
    const tmp = path.join(os.tmpdir(), `m9-web-${Date.now()}.epub`);
    await fsp.writeFile(tmp, epub);
    try {
      const session = await openBookSession(tmp);
      assert.equal(session.chapters.length, 1);
      assert.ok(session.chapters[0].text.includes('雾气'));
      assert.ok(session.chapters[0].text.includes('溪谷会留在页边'));
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  } finally {
    server.close();
  }
});

test('offline export: already-saved article exports with zero network (M9 §90)', async () => {
  const { server, origin } = await startOriginServer();
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-off-'));
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  try {
    const first = await captureAndExportToEpub({
      url: `${origin}/article`, libraryRoot: lib, destDir: dest, options: { now: new Date(0) },
    });
    assert.equal(first.success, true);
    server.close(); // "disconnect the network"

    // export the SAVED document again — must succeed with no server at all
    const { scanLibrary } = await import('../../src/library/scan.js');
    const { entries } = await scanLibrary(lib);
    const entry = entries.find((e) => e.document_id === first.documentId);
    assert.ok(entry, 'captured document found by file scan');
    const result = await exportDocumentsToEpub({
      libraryRoot: lib,
      entries: [{ document_id: entry.document_id, path: entry.dir, title: entry.title }],
      destDir: path.join(dest, 'offline'),
      options: { now: new Date(0) },
    });
    assert.equal(result.success, true, 'offline re-export must succeed');
    const epub = await fsp.readFile(result.outputPath);
    assert.ok(epub.includes(PNG_1PX), 'image comes from local assets, not the network');
  } finally {
    server.close();
  }
});

test('failed capture → clean structured error, no partial EPUB (M9 §42/§57)', async () => {
  const { server, origin } = await startOriginServer();
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-fail-'));
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  try {
    await assert.rejects(
      () => captureAndExportToEpub({
        url: `${origin}/missing-page`, libraryRoot: lib, destDir: dest,
      }),
      (err) => err instanceof Error && /采集失败/.test(err.message),
    );
    const leftovers = (await fsp.readdir(dest)).filter((f) => f.includes('.tmp') || f.endsWith('.epub'));
    assert.deepEqual(leftovers, []);
  } finally {
    server.close();
  }
});
