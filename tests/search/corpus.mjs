/**
 * Deterministic M3 search corpus (M3 §118/119).
 * Fixed document IDs, texts, tags, annotations and states so CI results are
 * stable across runs. Also the basis of search-regression.json.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../../src/core/atomic-write.js';
import { writeMeta } from '../../src/core/meta.js';
import { appendAnnotation } from '../../src/annotation/store.js';
import { createAnnotation } from '../../src/annotation/annotation.js';
import { updateUserState } from '../../src/library/user-state.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const CORPUS = [
  {
    n: 1, title: '本地优先软件的设计原则', author: '灰灰', tags: ['本地优先', '设计'],
    body: '本地优先软件把用户资料放在用户自己的设备上。文件是唯一的真相，数据库只是派生索引。这条原则值得反复阅读。',
    annotations: [{ type: 'highlight', quote: '文件是唯一的真相', note: '核心原则，写进产品纲领' }],
  },
  {
    n: 2, title: 'SQLite FTS5 in Practice', author: 'Jane Doe', tags: ['sqlite', 'search'],
    body: 'SQLite FTS5 provides full-text search with ranking. This article benchmarks tokenizer choices for mixed English and Chinese content.',
    annotations: [{ type: 'note', quote: null, note: '对比 FTS5 与内存子串搜索的基准' }],
  },
  {
    n: 3, title: 'Rust 与 WebAssembly 实战', author: '陈默', tags: ['rust', 'wasm'],
    body: 'Rust 编译到 WebAssembly 后可以在浏览器中高性能运行。本文演示 2026 年最新的工具链用法。',
    annotations: [],
  },
  {
    n: 4, title: 'Reading Archive Design Notes', author: 'Jane Doe', tags: ['设计'],
    body: 'A reading archive should outlive any single service. The folder is the library; the index is disposable.',
    annotations: [{ type: 'highlight', quote: 'The folder is the library', note: '' }],
  },
  {
    n: 5, title: '2026 前端趋势观察', author: '灰灰', tags: ['前端', 'AI'],
    body: '2026 年前端领域的关键词包括 AI 辅助编码、本地优先同步与更轻的运行时。SQLite 与 WASM 组合值得关注。',
    annotations: [],
  },
];

/** Build the corpus into a library directory. Returns { documentIds }. */
export async function buildCorpus(libraryRoot) {
  // full isolation: library (user state) + app home (derived search index)
  process.env.REVERIE_LIBRARY = libraryRoot;
  process.env.REVERIE_HOME = await fsp.mkdtemp(path.join(path.dirname(libraryRoot), 'reverie-home-'));
  const { resetCacheForTests } = await import('../../src/library/user-state.js');
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  resetCacheForTests();
  invalidateSearchIndex();
  const now = '2026-10-04T08:00:00.000Z';
  const documentIds = {};
  for (const spec of CORPUS) {
    const documentId = id(spec.n);
    documentIds[spec.title] = documentId;
    const dir = path.join(libraryRoot, 'articles', '2026', documentId);
    await writeMeta(dir, {
      format_version: 1,
      document_id: documentId,
      type: 'article',
      title: spec.title,
      author: spec.author,
      created_at: now,
      captured_at: now,
      updated_at: now,
      source: {
        original_url: `https://example.com/post/${spec.n}`,
        canonical_url: `https://example.com/post/${spec.n}`,
        capture_time: now,
        extractor: { name: 'readability', version: '0.6.0' },
      },
    });
    await writeFileAtomic(path.join(dir, 'article.md'), `# ${spec.title}\n\n${spec.body}\n`);
    const annServicePath = path.join(dir, 'annotations.jsonl');
    let i = 0;
    for (const a of spec.annotations) {
      const annotation = createAnnotation({
        documentId,
        type: a.type,
        locator: a.quote
          ? { kind: 'text-quote', position: { start: 0, end: a.quote.length } }
          : { kind: 'none' },
        quote: a.quote ?? undefined,
        note: a.note ?? '',
      });
      annotation.annotation_id = id(spec.n * 100 + ++i);
      await appendAnnotation(annServicePath, annotation);
    }
  }
  // user states: spec tags land in user state (source of truth), plus per-doc states
  for (const spec of CORPUS) {
    await updateUserState(id(spec.n), { tags: spec.tags });
  }
  await updateUserState(id(1), { read: true, favorite: true, inbox: false, tags: [...CORPUS[0].tags, '特别收藏'], last_opened_at: '2026-10-05T00:00:00.000Z' });
  await updateUserState(id(2), { inbox: true });
  await fsp.access(path.join(libraryRoot, 'user-state.json')); // ensure file layout
  return { documentIds };
}
