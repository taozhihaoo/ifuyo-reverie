/**
 * M3 benchmark (M3 §92/93/138): real measurements over synthetic libraries.
 * NOT part of `npm test` — run explicitly via `npm run bench:m3`.
 * All numbers printed here are produced by this run (M3 §139: never fake ms).
 */
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeMeta } from '../src/core/meta.js';
import { writeFileAtomic } from '../src/core/atomic-write.js';
import { newId } from '../src/core/ids.js';
import { rebuildSearchIndex, refreshSearchIndex, search, queryLibrary, loadSearchIndex } from '../src/search/search-service.js';
import { resetCacheForTests } from '../src/library/user-state.js';

const SIZES = (process.env.BENCH_SIZES ?? '100,1000').split(',').map(Number);

const zhWords = ['本地优先', '文件系统', '数据库索引', '全文搜索', '中文分词', '阅读档案', '知识管理', '离线可用'];
const enWords = ['local-first', 'full-text search', 'SQLite FTS5', 'tokenizer', 'benchmark', 'archive'];
const makeDoc = (i) => {
  const lang = i % 3 === 0 ? 'zh' : i % 3 === 1 ? 'en' : 'mixed';
  const paras = [];
  for (let p = 0; p < 12; p++) {
    const zh = `第${p + 1}段：${zhWords[i % zhWords.length]}是本段的主题，包含足够长的中文连续文本用来测试子串匹配。`;
    const en = `Paragraph ${p + 1}: ${enWords[i % enWords.length]} matters here, with enough English text for prefix probing (2026, rev${i}).`;
    paras.push(lang === 'zh' ? zh : lang === 'en' ? en : `${zh} ${en}`);
  }
  const title = lang === 'zh' ? `基准文档 ${i}：${zhWords[i % zhWords.length]}` : lang === 'en' ? `Bench Doc ${i}: ${enWords[i % enWords.length]}` : `Bench 混合 ${i}`;
  return { title, md: `# ${title}\n\n${paras.join('\n\n')}\n` };
};

const percentile = (arr, p) => {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

async function bench(size) {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), `reverie-bench-${size}-`));
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `bench-home-${size}`);
  resetCacheForTests();
  const { invalidateSearchIndex } = await import('../src/search/search-service.js');
  invalidateSearchIndex();

  // create docs
  const tCreate = Date.now();
  const queries = [];
  for (let i = 0; i < size; i++) {
    const { title, md } = makeDoc(i);
    const documentId = newId();
    const dir = path.join(lib, 'articles', '2026', documentId);
    const now = new Date().toISOString();
    await writeMeta(dir, {
      format_version: 1, document_id: documentId, type: 'article', title,
      author: i % 2 ? '作者甲' : 'Author B',
      created_at: now, captured_at: now, updated_at: now,
      source: { original_url: `https://example.com/bench/${i}`, capture_time: now, extractor: { name: 'readability', version: '0.6.0' } },
    });
    await writeFileAtomic(path.join(dir, 'article.md'), md);
    queries.push(i % 3 === 0 ? '本地优先' : i % 3 === 1 ? 'benchmark' : 'SQLite');
  }
  const createMs = Date.now() - tCreate;

  // full rebuild (cold)
  const t0 = Date.now();
  await rebuildSearchIndex(lib);
  const rebuildMs = Date.now() - t0;

  // cold query (first after index write — closest to warm here; cold meaning noted)
  const latencies = [];
  for (let i = 0; i < 30; i++) {
    const q = queries[(i * 7) % queries.length];
    const t = Date.now();
    await search(q, { libraryRoot: lib });
    latencies.push(Date.now() - t);
  }
  // mixed + filter queries
  const tFilter = Date.now();
  await queryLibrary('', { view: 'inbox', libraryRoot: lib });
  const filterMs = Date.now() - tFilter;
  const tRecent = Date.now();
  await queryLibrary('', { view: 'recent', sort: 'recent-opened', libraryRoot: lib });
  const recentMs = Date.now() - tRecent;

  // incremental refresh (nothing changed -> pure stat pass)
  const tRefresh = Date.now();
  await refreshSearchIndex(lib);
  const refreshMs = Date.now() - tRefresh;

  // search with results (subset)
  const sample = [];
  for (let i = 0; i < 20; i++) {
    const q = queries[(i * 3) % queries.length];
    const t = Date.now();
    const r = await search(q, { libraryRoot: lib });
    sample.push({ ms: Date.now() - t, hits: r.total });
  }

  const indexRaw = await fsp.readFile(path.join(process.env.REVERIE_HOME, 'search-index.json'), 'utf8');
  console.log(`\n=== ${size} documents ===`);
  console.log(`docs created: ${size} in ${createMs}ms (${Math.round(createMs / size)}ms/doc incl. file IO)`);
  console.log(`full reindex: ${rebuildMs}ms`);
  console.log(`incremental refresh (no changes): ${refreshMs}ms`);
  console.log(`search p50: ${percentile(latencies, 0.5)}ms  p95: ${percentile(latencies, 0.95)}ms  max: ${Math.max(...latencies)}ms (${latencies.length} queries)`);
  console.log(`inbox filter: ${filterMs}ms  recent view: ${recentMs}ms`);
  console.log(`search index size: ${Math.round(indexRaw.length / 1024)} KB`);
  console.log(`sample hits: ${sample.slice(0, 3).map((s) => s.hits).join(',')}`);
}

for (const size of SIZES) {
  await bench(size);
}
console.log('\n(all numbers from this real run — see docs/PERF.md)');
