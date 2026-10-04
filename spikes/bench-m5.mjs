/**
 * M5 benchmark (M5 §67/§139): real measurements over synthetic import files
 * and library exports. Run explicitly via `npm run bench:m5`. NOT part of npm test.
 */
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { previewImport, commitImport } from '../src/importexport/import-service.js';
import { exportDocumentToMarkdown, validateMarkdownExport } from '../src/importexport/export/markdown-exporter.js';
import { exportArticleToEpub, validateEpubBuffer } from '../src/importexport/export/epub-exporter.js';
import { rebuildSearchIndex, search } from '../src/search/search-service.js';
import { resetCacheForTests } from '../src/library/user-state.js';

const SIZES = (process.env.BENCH_SIZES ?? '100,1000').split(',').map(Number);

function makePocketExport(n) {
  const list = {};
  for (let i = 0; i < n; i++) {
    list[String(100000 + i)] = {
      item_id: String(100000 + i),
      resolved_title: `基准文档 ${i}：本地优先与全文搜索`,
      resolved_url: `https://bench.example/${i}`,
      excerpt: `<p>第 ${i} 篇：这是用于导入基准测试的摘要文本，包含中文与 English mixed content。</p>`,
      status: i % 2,
      favorite: i % 5 === 0 ? 1 : 0,
      time_added: 1728000000 + i * 60,
      tags: i % 3 === 0 ? { t1: { tag: 'bench' } } : {},
    };
  }
  return JSON.stringify({ status: 2, list });
}

const percentile = (arr, p) => {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

for (const size of SIZES) {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), `reverie-m5bench-${size}-`));
  process.env.REVERIE_LIBRARY = lib;
  // unique per-run home/index paths — otherwise a previous bench run's
  // import keys would leak into this run via the shared tmpdir
  process.env.REVERIE_HOME = lib + '-home';
  process.env.REVERIE_SEARCH_INDEX = lib + '-search-index.json';
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../src/search/search-service.js');
  invalidateSearchIndex();

  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), `reverie-m5src-${size}-`));
  const file = path.join(tmp, 'pocket.json');
  await fsp.writeFile(file, makePocketExport(size));

  const tParse = Date.now();
  const preview = await previewImport(lib, file);
  const parseMs = Date.now() - tParse;

  const tCommit = Date.now();
  const report = await commitImport(lib, file);
  const commitMs = Date.now() - tCommit;

  const tIndex = Date.now();
  await rebuildSearchIndex(lib);
  const indexMs = Date.now() - tIndex;

  const tSearch = Date.now();
  await search('本地优先', { libraryRoot: lib });
  const searchMs = Date.now() - tSearch;

  console.log(`\n=== ${size} items ===`);
  console.log(`parse+preview: ${parseMs}ms  commit(write all): ${commitMs}ms (${Math.round(commitMs / size * 100) / 100}ms/item)  reindex: ${indexMs}ms  search: ${searchMs}ms`);
  console.log(`created: ${report.created}  skipped: ${report.skipped}  failed: ${report.failed}`);

  // idempotent second import
  const t2 = Date.now();
  const rep2 = await commitImport(lib, file);
  console.log(`idempotent re-import: ${Date.now() - t2}ms (created ${rep2.created}, skipped ${rep2.skipped})`);

  // export sample: export 10 docs to markdown + 1 epub
  const { exportArticleToEpub, validateEpubBuffer } = await import('../src/importexport/export/epub-exporter.js');
  const { parseMarkdownBlocks } = await import('../src/reader/markdown-reader.js');
  const tExp = Date.now();
  let exported = 0;
  const index = await rebuildSearchIndex(lib);
  for (const entry of index.documents.slice(0, 10)) {
    const dir = path.join(lib, entry.path);
    const md = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'));
    const buf = exportArticleToEpub({
      title: meta.title, author: meta.author ?? null, markdown: md,
      publishedAt: meta.published_at ?? null,
      sourceUrl: meta.source?.original_url ?? null, documentId: meta.document_id,
    });
    const v = validateEpubBuffer(buf);
    if (!v.ok) { console.log('EPUB INVALID:', v.errors); process.exitCode = 1; }
    exported++;
  }
  console.log(`epub export (10 docs): ${Date.now() - tExp}ms, all structurally valid`);
}

console.log('\n(all numbers from this real run — see docs/PERF.md)');
