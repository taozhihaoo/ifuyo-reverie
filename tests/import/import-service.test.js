/**
 * Import pipeline tests (M5 §85/86/90/91/93).
 * NOTE: these tests mutate process.env and share the search-service module
 * cache, so they MUST run sequentially — wrapped in describe(concurrency: 1).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseImportFile, previewImport, commitImport } from '../../src/importexport/import-service.js';
import { detectFormat } from '../../src/importexport/sources.js';
import { resetCacheForTests, loadUserState, stateOf } from '../../src/library/user-state.js';
import { rebuildSearchIndex, search } from '../../src/search/search-service.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'import');
const fixture = (...p) => path.join(fixtureDir, ...p);
const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m5-'));

describe('import pipeline (sequential — mutates env)', { concurrency: 1 }, () => {
  const setup = async () => {
    const lib = await tmpdir();
    process.env.REVERIE_LIBRARY = lib;
    process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
    process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-index-${path.basename(lib)}.json`);
    resetCacheForTests();
    const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
    invalidateSearchIndex();
    return lib;
  };

  test('format detection: pocket / wallabag / raindrop', async () => {
    const pocket = JSON.parse(await fsp.readFile(fixture('pocket', 'normal.json'), 'utf8'));
    assert.equal(detectFormat(pocket, ''), 'pocket');
    const wallabag = JSON.parse(await fsp.readFile(fixture('wallabag', 'normal.json'), 'utf8'));
    assert.equal(detectFormat(wallabag, ''), 'wallabag');
    const raindrop = JSON.parse(await fsp.readFile(fixture('raindrop', 'normal.json'), 'utf8'));
    assert.equal(detectFormat(raindrop, ''), 'raindrop');
  });

  test('parse import file: pocket normal maps title/url/tags/read (M5 §12.2)', async () => {
    const { source_type, records } = await parseImportFile(fixture('pocket', 'normal.json'));
    assert.equal(source_type, 'pocket');
    assert.equal(records.length, 3);
    const first = records.find((r) => r.external_id === '1001');
    assert.equal(first.title, '本地优先的设计');
    assert.equal(first.url, 'https://example.com/local-first');
    assert.deepEqual(first.tags, ['设计']);
    assert.equal(first.read, false);
    const archived = records.find((r) => r.external_id === '1002');
    assert.equal(archived.read, true);
    const noTitle = records.find((r) => r.external_id === '1003');
    assert.equal(noTitle.title, null);
  });

  test('wallabag: content preserved, is_archived->read, is_starred->favorite (M5 §15/19)', async () => {
    const { records } = await parseImportFile(fixture('wallabag', 'normal.json'));
    assert.equal(records.length, 2);
    assert.equal(records[0].content_html, '<p>Wallabag 的完整正文内容。</p>');
    assert.equal(records[0].author, '作者乙');
    assert.equal(records[0].favorite, true);
    assert.equal(records[1].read, true);
    assert.equal(records[1].favorite, false);
  });

  test('raindrop: excerpt/note/collection/important map defensively (M5 §17)', async () => {
    const { records } = await parseImportFile(fixture('raindrop', 'normal.json'));
    assert.equal(records.length, 2);
    assert.equal(records[0].note, '我的备注');
    assert.equal(records[0].collection, '开发');
    assert.equal(records[0].favorite, true);
    assert.equal(records[1].content_html, null);
  });

  test('preview counts new/skip without writing (M5 §9)', async () => {
    const lib = await setup();
    const file = fixture('pocket', 'normal.json');
    const preview1 = await previewImport(lib, file);
    assert.equal(preview1.counts.total, 3);
    assert.equal(preview1.counts.new, 3);
    await commitImport(lib, file);
    const preview2 = await previewImport(lib, file);
    assert.equal(preview2.counts.total, 3);
    assert.equal(preview2.counts.skip, 3);
    assert.equal(preview2.counts.new, 0);
  });

  test('malformed / empty files produce typed errors, never crash (M5 §74/§86)', async () => {
    await assert.rejects(() => parseImportFile(fixture('pocket', 'malformed.json')), (err) => {
      assert.equal(err.code, 'PARSE_ERROR');
      return true;
    });
    const empty = await parseImportFile(fixture('pocket', 'empty.json'));
    assert.equal(empty.records.length, 0);
    const raindropEmpty = await parseImportFile(fixture('raindrop', 'empty.json'));
    assert.equal(raindropEmpty.records.length, 0);
  });

  test('unicode: Japanese title + emoji survive import (M5 §75)', async () => {
    const lib = await setup();
    const report = await commitImport(lib, fixture('pocket', 'unicode.json'));
    assert.equal(report.created, 1);
    const dirs = (await fsp.readdir(path.join(lib, 'articles', '2026'))).filter((d) => !d.startsWith('.'));
    const meta = JSON.parse(await fsp.readFile(path.join(lib, 'articles', '2026', dirs[0], 'meta.json'), 'utf8'));
    assert.equal(meta.title, '日本語の記事 🎉');
  });

  test('provenance persisted in meta.json, survives index rebuild (M5 §11)', async () => {
    const lib = await setup();
    await commitImport(lib, fixture('pocket', 'normal.json'));
    const dirs = (await fsp.readdir(path.join(lib, 'articles', '2026'))).filter((d) => !d.startsWith('.'));
    const meta = JSON.parse(await fsp.readFile(path.join(lib, 'articles', '2026', dirs[0], 'meta.json'), 'utf8'));
    assert.equal(meta.provenance.source_type, 'pocket');
    assert.ok(meta.provenance.import_key.startsWith('pocket:'));
    await rebuildSearchIndex(lib);
    const still = JSON.parse(await fsp.readFile(path.join(lib, 'articles', '2026', dirs[0], 'meta.json'), 'utf8'));
    assert.equal(still.provenance.import_key, meta.provenance.import_key);
  });

  test('idempotency: import same file 3x -> no duplicate documents (M5 §10/§90)', async () => {
    const lib = await setup();
    const file = fixture('pocket', 'normal.json');
    const r1 = await commitImport(lib, file);
    assert.equal(r1.created, 3);
    const r2 = await commitImport(lib, file);
    assert.equal(r2.created, 0);
    assert.equal(r2.skipped, 3);
    const r3 = await commitImport(lib, file);
    assert.equal(r3.created, 0);
    assert.equal(r3.skipped, 3);
    const dirs = (await fsp.readdir(path.join(lib, 'articles', '2026'))).filter((d) => !d.startsWith('.'));
    assert.equal(dirs.length, 3, 'document count must not grow');
  });

  test('cancelled import reports cancelled and keeps completed items (M5 §93)', async () => {
    const lib = await setup();
    const controller = new AbortController();
    let calls = 0;
    const report = await commitImport(lib, fixture('pocket', 'normal.json'), {
      signal: controller.signal,
      onProgress: () => { calls++; if (calls >= 2) controller.abort(); },
    });
    assert.equal(report.status, 'cancelled');
    assert.ok(report.created >= 1, 'completed items stay');
  });

  test('imported documents enter search index and user state defaults (M3 integration)', async () => {
    const lib = await setup();
    await commitImport(lib, fixture('pocket', 'normal.json'));
    const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
    invalidateSearchIndex();
    await rebuildSearchIndex(lib);
    const r = await search('本地优先的设计', { libraryRoot: lib });
    assert.equal(r.total, 1);
    const userState = await loadUserState();
    for (const documentId of Object.keys(userState.states)) {
      const st = stateOf(userState, documentId);
      assert.equal(st.inbox, true, 'imported doc defaults to inbox');
      assert.equal(st.read, false, 'imported doc defaults to unread');
    }
    await rebuildSearchIndex(lib);
    const preview = await previewImport(lib, fixture('pocket', 'normal.json'));
    assert.equal(preview.counts.skip, 3, 'idempotency survives index rebuild');
  });

  test('original import file is never modified (M5 §58)', async () => {
    const src = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-src-'));
    const file = path.join(src, 'pocket_export.json');
    await fsp.copyFile(fixture('pocket', 'normal.json'), file);
    const before = await fsp.readFile(file, 'utf8');
    const lib = await setup();
    await commitImport(lib, file);
    assert.equal(await fsp.readFile(file, 'utf8'), before, 'external file must stay byte-identical');
  });
});
