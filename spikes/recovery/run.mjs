/**
 * Index Recovery PoC (M0 §23):
 *   Delete Index -> Read Source Files -> Rebuild
 * Goal: prove the library directory alone is the complete asset — the index
 * is disposable, and rebuilding never touches source files.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../../src/core/atomic-write.js';
import { writeMeta } from '../../src/core/meta.js';
import { newId } from '../../src/core/ids.js';
import { appendAnnotation } from '../../src/annotation/store.js';
import { createAnnotation } from '../../src/annotation/annotation.js';
import { scanLibrary, indexFingerprint } from '../../src/library/scan.js';

export async function makeFixtureLibrary(root) {
  const now = new Date().toISOString();
  const artDir = path.join(root, 'articles', '2026', newId());
  await writeMeta(artDir, {
    format_version: 1,
    document_id: path.basename(artDir),
    type: 'article',
    title: '文件是真相',
    author: '示例',
    created_at: now,
    updated_at: now,
    source: {
      original_url: 'https://example.com/a',
      canonical_url: 'https://example.com/a',
      capture_time: now,
      extractor: { name: 'readability', version: '0.6.0' },
    },
  });
  await writeFileAtomic(path.join(artDir, 'article.md'), '# 文件是真相\n\n正文内容。\n');
  await writeFileAtomic(path.join(artDir, 'source', 'page.html'), '<html><body>正文内容。</body></html>');
  await appendAnnotation(path.join(artDir, 'annotations.jsonl'), createAnnotation({
    documentId: path.basename(artDir),
    type: 'highlight',
    locator: { kind: 'text-quote', position: { start: 0, end: 6 } },
    quote: '文件是真相',
  }));

  const bookDir = path.join(root, 'books', newId());
  await writeMeta(bookDir, {
    format_version: 1,
    document_id: path.basename(bookDir),
    type: 'book',
    title: '示例书',
    created_at: now,
    updated_at: now,
  });
  await writeFileAtomic(path.join(bookDir, 'book.epub'), 'PK-fake-epub-bytes');
  return { artDir, bookDir };
}

export async function buildIndexFile(appDataDir, libraryRoot) {
  const index = await scanLibrary(libraryRoot);
  await writeFileAtomic(path.join(appDataDir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}

async function dirHash(root) {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  async function walk(dir) {
    for (const d of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) await walk(p);
      else hash.update(path.relative(root, p)).update(await fsp.readFile(p));
    }
  }
  await walk(root);
  return hash.digest('hex');
}

// --- standalone execution --------------------------------------------------
const isMain = import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const { tmpdir } = await import('node:os');
  const libraryRoot = await fsp.mkdtemp(path.join(tmpdir(), 'reverie-lib-'));
  const appData = await fsp.mkdtemp(path.join(tmpdir(), 'reverie-app-'));
  await makeFixtureLibrary(libraryRoot);

  const before = await dirHash(libraryRoot);
  const index1 = await buildIndexFile(appData, libraryRoot);
  const fp1 = indexFingerprint(index1);

  // simulate index corruption/deletion
  await fsp.rm(path.join(appData, 'index.json'));

  const index2 = await buildIndexFile(appData, libraryRoot);
  const fp2 = indexFingerprint(index2);
  const after = await dirHash(libraryRoot);

  console.log('entries:', index2.entries.length);
  console.log('index fingerprint equal:', fp1 === fp2);
  console.log('library byte-identical after rebuild:', before === after);
  console.log('index wrote into library:', before !== after ? 'YES (BUG)' : 'no');
  process.exit(fp1 === fp2 && before === after ? 0 : 1);
}
