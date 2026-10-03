import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { runCapture } from '../../src/capture/pipeline.js';
import { createCaptureRequest } from '../../src/capture/protocol.js';
import { enqueue, recoverOnStartup, listJobs } from '../../src/capture/queue.js';
import { processQueue } from '../../src/capture/worker.js';
import { loadIndex, rebuildIndex, loadReadState, setReadState } from '../../src/library/index.js';
import { captureToLibrary } from '../../src/library/persist.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-rt-'));
const ARTICLE_HTML = `<html><head><title>往返测试</title></head><body><article>
<h1>往返测试</h1>
${Array.from({ length: 8 }, (_, i) => `<p>第${i + 1}段：保存网页不是为了留住链接，而是为了留住内容本身，即使原站消失${i}。</p>`).join('')}
</article></body></html>`;

async function startServer() {
  const server = createServer((req, res) => {
    if (req.url === '/nope') { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(ARTICLE_HTML);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const { server, origin } = await startServer();
process.on('exit', () => server.close());
const dirHash = async (root) => {
  const hash = createHash('sha256');
  const walk = async (dir) => {
    for (const d of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) await walk(p);
      else hash.update(path.relative(root, p)).update(await fsp.readFile(p));
    }
  };
  await walk(root);
  return hash.digest('hex');
};

test('M1 §26 round-trip: capture -> persist -> restart -> index -> same content', async () => {
  const lib = await tmpdir();
  const queueDir = await tmpdir();
  const appData = await tmpdir();

  // 1. browser sends request -> host enqueues
  const req = createCaptureRequest({ url: `${origin}/roundtrip`, title: '往返测试' });
  await enqueue(queueDir, req);

  // 2. app (re)starts: recover + process
  await recoverOnStartup(queueDir);
  await processQueue({ queueDir, libraryRoot: lib });
  const jobs = await listJobs(queueDir);
  assert.equal(jobs[0].status, 'completed', JSON.stringify(jobs[0]));
  const articleId = jobs[0].article_id;
  assert.ok(articleId);

  // 3. rebuild index (app start scan)
  const { index } = await rebuildIndex(lib, path.join(appData, 'index.json'));
  const entry = index.entries.find((e) => e.document_id === articleId);
  assert.ok(entry, 'index must contain the new article');
  assert.equal(entry.title.includes('往返测试'), true);

  // 4. reader opens the article: same content that was captured
  const dir = path.join(lib, entry.path);
  const md = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
  assert.ok(md.includes('即使原站消失1'));
  const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'));
  const hash = createHash('sha256').update(md).digest('hex');
  assert.equal(meta.source.content_hash, 'sha256-' + hash);

  // 5. simulated crash: delete the derived index -> rebuild -> article back
  const before = await dirHash(lib);
  await fsp.rm(path.join(appData, 'index.json'));
  const rebuilt = await loadIndex(lib, path.join(appData, 'index.json'));
  assert.ok(rebuilt.entries.some((e) => e.document_id === articleId));
  const after = await dirHash(lib);
  assert.equal(after, before, 'rebuild must not touch library files');

  // 6. read state lives outside the library
  const rsPath = path.join(appData, 'read-state.json');
  await setReadState(articleId, 'read', rsPath);
  const rs = await loadReadState(rsPath);
  assert.equal(rs.states[articleId].state, 'read');
  assert.equal(await dirHash(lib), before, 'read state must never touch the library');
});

test('M1 §27 crash injection: persist rollback leaves no half article', async () => {
  const lib = await tmpdir();
  const result = await runCapture(createCaptureRequest({ url: `${origin}/roundtrip` }), { libraryRoot: lib });
  assert.equal(result.status, 'completed'); // sanity: normal capture works

  // direct guard: mismatched content_hash is rejected and nothing is promoted
  const badMeta = {
    format_version: 1, document_id: '11111111-2222-4333-8444-555555555555', type: 'article',
    title: 'x', created_at: '2026-10-04T00:00:00.000Z', updated_at: '2026-10-04T00:00:00.000Z',
    captured_at: '2026-10-04T00:00:00.000Z',
    source: {
      original_url: 'https://x.example/', capture_time: '2026-10-04T00:00:00.000Z',
      extractor: { name: 'r', version: '0' }, content_hash: 'sha256-deadbeef',
    },
  };
  await assert.rejects(() => captureToLibrary({
    libraryRoot: lib, meta: badMeta, articleMarkdown: '# 不匹配的内容\n', sourceHtml: '<html></html>', assets: [],
  }), /content_hash mismatch/);

  const year = new Date().getFullYear();
  const dirs = await fsp.readdir(path.join(lib, 'articles', String(year)));
  assert.equal(dirs.filter((d) => d.startsWith('.tmp-')).length, 0, 'no staging leftovers after rollback');
  assert.equal(dirs.filter((d) => !d.startsWith('.')).length, 1, 'official dir count unchanged');
});

test('worker retries transient failures and ends in a terminal state', async () => {
  const lib = await tmpdir();
  const queueDir = await tmpdir();
  await enqueue(queueDir, createCaptureRequest({ url: `${origin}/nope` }));
  await processQueue({ queueDir, libraryRoot: lib, maxJobs: 4 });
  const jobs = await listJobs(queueDir);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'failed');
  assert.ok(jobs[0].retry_count >= 1, 'network errors should have been retried');
});
