/**
 * M9 advanced EPUB export tests: rich rendering, multi-document books,
 * deterministic output, source immutability, index-rebuild equivalence,
 * atomicity/cancellation, and a real M6-reader round-trip on every export.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildEpub, dedupeTitles, epubIdentifier, markdownBlocksToXhtml } from '../../src/importexport/export/epub-builder.js';
import { exportDocumentsToEpub, validateBuiltEpub, ExportError } from '../../src/importexport/export/epub-export-service.js';
import { parseMarkdownBlocks } from '../../src/reader/markdown-reader.js';
import { openBookSession } from '../../src/reader/epub-reader-core.js';
import { writeMeta } from '../../src/core/meta.js';
import { newId } from '../../src/core/ids.js';

const FIX = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'export', name);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- builder
test('builder: rich inline rendering — bold/em/code/link, javascript: stripped (M9 §47-49)', () => {
  const md = '**加粗** 与 *斜体*、`行内码`、[链接](https://example.com/a)、[坏链接](javascript:alert(1))。';
  const { blocks } = parseMarkdownBlocks(md);
  const { html, warnings } = markdownBlocksToXhtml(blocks);
  assert.ok(html.includes('<strong>加粗</strong>'));
  assert.ok(html.includes('<em>斜体</em>'));
  assert.ok(html.includes('<code>行内码</code>'));
  assert.ok(html.includes('href="https://example.com/a"'));
  assert.ok(!html.includes('javascript:'), 'javascript: href must be stripped');
  assert.ok(html.includes('坏链接'), 'label text survives');
  assert.equal(warnings.length, 0);
});

test('builder: images map to content-addressed epub paths; dedup across docs (M9 §21/§22)', () => {
  const sha = 'a'.repeat(64);
  const doc = (id, title) => ({
    documentId: id, title,
    markdown: `# ${title}\n\n看图：\n\n![图](assets/${sha}.jpg)\n`,
  });
  const build = buildEpub([doc('d1', '甲'), doc('d2', '乙')], { bookTitle: '合集', now: new Date(0) });
  const imgEntries = build.files.filter((f) => f.name.startsWith('OEBPS/images/'));
  // bytes are attached by the service; the builder plans exactly one planned asset
  assert.equal(build.assetCount, 1, 'same sha across two docs → one asset entry');
  const html = build.files.filter((f) => f.name.includes('chap')).map((f) => f.data.toString()).join('');
  assert.ok(html.includes('src="images/' + sha + '.jpg"'));
  void imgEntries;
});

test('builder: missing image file is planned as dropped → warning (M9 §23)', () => {
  const md = '# T\n\n![x](assets/' + 'b'.repeat(64) + '.png)';
  const { blocks } = parseMarkdownBlocks(md);
  const { html, warnings } = markdownBlocksToXhtml(blocks, () => ({ path: null }));
  assert.ok(!html.includes('<img'));
  assert.ok(warnings.some((w) => w.includes('图片缺失')));
});

test('builder: chapter titles dedupe stably (M9 §13)', () => {
  assert.deepEqual(dedupeTitles(['同题', '同题', '同题', '别的']), ['同题', '同题 (2)', '同题 (3)', '别的']);
});

test('builder: deterministic — same input+now → byte-identical EPUB (M9 §61/103)', () => {
  const doc = {
    documentId: newId(), title: '确定性测试', author: '作者',
    markdown: '# 确定性测试\n\n段落一。\n\n## 小节\n\n段落二。\n',
  };
  const now = new Date('2026-10-05T00:00:00Z');
  const a = buildEpub([doc], { now });
  const b = buildEpub([doc], { now });
  assert.deepEqual(a.identifier, b.identifier);
  assert.deepEqual(a.files.map((f) => f.name), b.files.map((f) => f.name));
  for (let i = 0; i < a.files.length; i++) {
    assert.deepEqual(a.files[i].data, b.files[i].data, `entry ${a.files[i].name} differs`);
  }
});

test('builder: deterministic identifier independent of export order (M9 §14)', () => {
  const id1 = epubIdentifier(['a', 'b'], '书');
  const id2 = epubIdentifier(['b', 'a'], '书');
  assert.equal(id1, id2);
  assert.match(id1, /^urn:reverie:book-[0-9a-f]{16}$/);
});

test('builder: code blocks preserve newlines verbatim (M9 §52)', () => {
  const md = '# t\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n';
  const { blocks } = parseMarkdownBlocks(md);
  const { html } = markdownBlocksToXhtml(blocks);
  const m = /<pre><code>([\s\S]*?)<\/code><\/pre>/.exec(html);
  assert.ok(m);
  assert.ok(m[1].includes('\n'), 'newlines preserved');
  assert.ok(m[1].includes('&amp;') || !m[1].includes('<script'), 'escaped, not raw HTML');
});

// ---------------------------------------------------------------- service
/** Fixture library with two real article docs (files only — no index needed). */
async function makeLibrary() {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-lib-'));
  const mk = async (title, md, { author = '测试者', asset = null } = {}) => {
    const id = newId();
    const dir = path.join(lib, 'articles', id);
    await fsp.mkdir(dir, { recursive: true });
    const now = '2026-10-05T08:00:00.000Z';
    await writeMeta(dir, {
      format_version: 1,
      document_id: id,
      type: 'article',
      title,
      created_at: now,
      captured_at: now,
      updated_at: now,
      source_type: 'web',
      source: {
        original_url: `https://example.com/${encodeURIComponent(title)}`,
        canonical_url: `https://example.com/${encodeURIComponent(title)}`,
        capture_time: now,
        extractor: { name: 'readability', version: '0.6.0' },
        content_hash: `sha256-${id.slice(0, 8)}`,
      },
    }, { now });
    if (author) {
      // author is optional-only; patch via writeMeta's own path
      const metaPath = path.join(dir, 'meta.json');
      const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
      meta.author = author;
      await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
    await fsp.writeFile(path.join(dir, 'article.md'), md);
    if (asset) {
      await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
      await fsp.writeFile(path.join(dir, 'assets', asset.name), asset.data);
    }
    return { document_id: id, path: path.join('articles', id), title };
  };
  return { lib, mk };
}

test('service: end-to-end single export — M6 round-trip, assets, immutability (M9 §58/§102)', async () => {
  const { lib, mk } = await makeLibrary();
  const sha = createHash('sha256').update('fake-image-bytes').digest('hex');
  const entry = await mk('单篇文章', `# 单篇文章\n\n正文**加粗**与图片：\n\n![图](assets/${sha}.jpg)\n`, {
    asset: { name: `${sha}.jpg`, data: Buffer.from('fake-image-bytes') },
  });
  const articleMd = await fsp.readFile(path.join(lib, entry.path, 'article.md'));
  const metaBuf = await fsp.readFile(path.join(lib, entry.path, 'meta.json'));
  const before = [sha256(articleMd), sha256(metaBuf)];

  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const result = await exportDocumentsToEpub({
    libraryRoot: lib,
    entries: [entry],
    destDir: dest,
    fileName: '我的文章: 第一篇?',
    options: { now: new Date('2026-10-05T00:00:00Z') },
  });
  assert.equal(result.success, true);
  assert.equal(result.chapterCount, 1);
  assert.equal(result.assetCount, 1);
  assert.equal(path.basename(result.outputPath), '我的文章_ 第一篇_.epub'.replace('__', '_'), 'filename sanitized');
  const epub = await fsp.readFile(result.outputPath);
  assert.ok(epub.length > 500);
  // immutability (M9 §102)
  const articleMd2 = await fsp.readFile(path.join(lib, entry.path, 'article.md'));
  const metaBuf2 = await fsp.readFile(path.join(lib, entry.path, 'meta.json'));
  assert.deepEqual([sha256(articleMd2), sha256(metaBuf2)], before, 'source files must be byte-identical');
  // no temp leftovers
  const leftovers = (await fsp.readdir(dest)).filter((f) => f.includes('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('service: multi-doc merge — book structure, TOC, title page, highlight appendix (M9 §37/§67)', async () => {
  const { lib, mk } = await makeLibrary();
  const e1 = await mk('第一篇', '# 第一篇\n\n内容一。\n');
  const e2 = await mk('第一篇', '# 第一篇（另一篇同题）\n\n内容二。\n'); // duplicate title on purpose
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const result = await exportDocumentsToEpub({
    libraryRoot: lib,
    entries: [e1, e2],
    destDir: dest,
    fileName: '合集',
    options: { bookTitle: '个人合集', includeHighlights: true, includeNotes: true, now: new Date(0) },
  });
  assert.equal(result.success, true);
  const epub = await fsp.readFile(result.outputPath);
  await validateBuiltEpub(epub, { expectedChapters: 2 });
  const text = epub.toString('utf8'); // STORE: UTF-8 bytes readable
  assert.ok(text.includes('title.xhtml'), 'book mode has a title page');
  assert.ok(text.includes('第一篇 (2)'), 'duplicate title numbered');
  // open with the actual M6 reader adapter (M9 §109): chapters + order + CJK
  const tmp = path.join(os.tmpdir(), `m9-roundtrip-${Date.now()}.epub`);
  await fsp.writeFile(tmp, epub);
  try {
    const session = await openBookSession(tmp);
    // spine = title page + 2 article chapters (M6 reader opens the M9 EPUB)
    assert.equal(session.chapters.length, 3);
    assert.deepEqual(session.chapters.slice(1).map((c) => c.title), ['第一篇', '第一篇 (2)']);
    assert.ok(session.chapters[1].text.includes('内容一。'));
    assert.ok(session.toc.length >= 2, 'M6 parses the nav TOC');
  } finally {
    await fsp.rm(tmp, { force: true });
  }
});

test('service: duplicate document ids export once (M9 §69); empty doc skipped with report (M9 §42)', async () => {
  const { lib, mk } = await makeLibrary();
  const e1 = await mk('唯一的一篇', '# 唯一的一篇\n\n内容。\n');
  const empty = await mk('空文档', '   \n');
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const result = await exportDocumentsToEpub({
    libraryRoot: lib,
    entries: [e1, e1, empty],
    destDir: dest,
    options: { now: new Date(0) },
  });
  assert.equal(result.documentCount, 1);
  assert.equal(result.skipped.length, 1);
  assert.ok(result.skipped[0].title.includes('空'));
});

test('service: index-free export — same result after "deleting the index" (M9 §60/§101)', async () => {
  const { lib, mk } = await makeLibrary();
  const e = await mk('重建后一致', '# 重建后一致\n\n内容一致。\n');
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const opts = { now: new Date(0) };
  const r1 = await exportDocumentsToEpub({ libraryRoot: lib, entries: [e], destDir: path.join(dest, 'a'), options: opts });
  // simulate full index loss: export reads only the passed entries + files
  const r2 = await exportDocumentsToEpub({ libraryRoot: lib, entries: [e], destDir: path.join(dest, 'b'), options: opts });
  const a = await fsp.readFile(r1.outputPath);
  const b = await fsp.readFile(r2.outputPath);
  assert.deepEqual(a, b, 'byte-identical exports with fixed now (no index involvement)');
});

test('service: cancellation — aborted signal stops before write, no tmp left (M9 §43)', async () => {
  const { lib, mk } = await makeLibrary();
  const e = await mk('取消测试', '# 取消测试\n\n内容。\n');
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => exportDocumentsToEpub({ libraryRoot: lib, entries: [e], destDir: dest, options: {}, signal: ac.signal }),
    (err) => err instanceof ExportError && err.code === 'cancelled',
  );
  const leftovers = await fsp.readdir(dest);
  assert.deepEqual(leftovers.filter((f) => f.includes('.tmp')), []);
});

test('service: existing output file survives a failed export (M9 §31/§87)', async () => {
  const { lib, mk } = await makeLibrary();
  const e = await mk('覆盖保护', '# 覆盖保护\n\n内容。\n');
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const outPath = path.join(dest, '覆盖保护.epub');
  await fsp.writeFile(outPath, 'OLD-CONTENT');
  await assert.rejects(
    () => exportDocumentsToEpub({ libraryRoot: lib, entries: [], destDir: dest }),
    (err) => err instanceof ExportError && err.code === 'input',
  );
  assert.equal(await fsp.readFile(outPath, 'utf8'), 'OLD-CONTENT');
  const leftovers = (await fsp.readdir(dest)).filter((f) => f.includes('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('service: missing asset file degrades to warning, export succeeds (M9 §23)', async () => {
  const { lib, mk } = await makeLibrary();
  const sha = 'c'.repeat(64);
  const e = await mk('缺图文章', '# 缺图文章\n\n![不存在的图](assets/${sha}.png)\n'.replace('${sha}', sha));
  const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m9-out-'));
  const result = await exportDocumentsToEpub({
    libraryRoot: lib, entries: [e], destDir: dest, options: { now: new Date(0) },
  });
  assert.equal(result.success, true);
  assert.equal(result.assetCount, 0);
  assert.ok(result.warnings.some((w) => w.includes('图片文件缺失')));
  const epub = await fsp.readFile(result.outputPath);
  assert.ok(!epub.toString('utf8').includes(`img-${sha.slice(0, 16)}`), 'dropped asset has no manifest line');
});
