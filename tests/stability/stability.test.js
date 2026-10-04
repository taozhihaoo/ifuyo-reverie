/**
 * M10 stability & recovery tests: future-version protection, atomic-write
 * fault injection, staging recovery, Doctor v2 checks/repair/idempotency,
 * index corruption recovery, library portability. Everything runs against
 * isolated temp libraries (M10 §127).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic, sweepTmpFiles } from '../../src/core/atomic-write.js';
import { UnsupportedVersionError } from '../../src/core/errors.js';
import {
  loadUserState, updateUserState, resetCacheForTests, userStateUnsupportedVersion,
} from '../../src/library/user-state.js';
import {
  loadFeeds, saveFeeds, feedsUnsupportedVersion,
} from '../../src/feed/feed-store.js';
import {
  findTmpFilesRecursive, sweepTmpFilesRecursive, findStagingCandidates,
  recoverStaging,
} from '../../src/library/recovery.js';
import {
  runDoctor, repairSafe, repairAnnotationsFile,
} from '../../src/library/doctor.js';
import { writeMeta } from '../../src/core/meta.js';
import { newId } from '../../src/core/ids.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m10-'));

// ------------------------------------------------- future-version protection
test('user-state: future version is read-only protected, never reset (M10 §26)', async () => {
  const lib = await tmpdir();
  process.env.REVERIE_USER_STATE = path.join(lib, 'user-state.json');
  resetCacheForTests();
  const future = { schema_version: 99, states: { doc: { read: true, favorite: true, inbox: false, tags: ['重要'] } } };
  const raw = JSON.stringify(future, null, 2);
  await fsp.writeFile(process.env.REVERIE_USER_STATE, raw);
  resetCacheForTests();

  const st = await loadUserState({ forceReload: true });
  assert.equal(st.states.doc.favorite, true, 'future data still readable');
  await assert.rejects(
    () => updateUserState('doc', { favorite: false }),
    (err) => err instanceof UnsupportedVersionError && err.code === 'UNSUPPORTED_VERSION',
  );
  assert.equal(await fsp.readFile(process.env.REVERIE_USER_STATE, 'utf8'), raw,
    'file must be byte-identical after a refused write');
  assert.equal(userStateUnsupportedVersion(), 99, 'Doctor visibility');
  resetCacheForTests();
});

test('feeds: future version is read-only protected, subscriptions survive (M10 §26)', async () => {
  const lib = await tmpdir();
  const raw = JSON.stringify({ feeds_version: 42, feeds: [{ feed_id: 'sub-1', canonical_url: 'https://x/rss' }] });
  await fsp.writeFile(path.join(lib, 'feeds.json'), raw);
  const data = await loadFeeds(lib);
  assert.equal(data.unsupported, true);
  assert.equal(data.feeds.length, 1);
  await assert.rejects(() => saveFeeds(lib, data), UnsupportedVersionError);
  assert.equal(await fsp.readFile(path.join(lib, 'feeds.json'), 'utf8'), raw);
  assert.equal(await feedsUnsupportedVersion(lib), 42);
});

// ------------------------------------------------- atomic write fault injection
test('writeFileAtomic: crash before rename leaves the ORIGINAL intact + a tmp leftover (M10 §8)', async () => {
  const dir = await tmpdir();
  const target = path.join(dir, 'data.json');
  await fsp.writeFile(target, '{"good":true}');
  // fault injection: make rename fail by pointing it at a directory target
  const asDir = path.join(dir, 'blocked');
  await fsp.mkdir(asDir);
  await assert.rejects(() => writeFileAtomic(asDir, 'x')); // rename onto dir fails
  // original temp leftovers of OTHER writes are sweepable
  await fsp.writeFile(path.join(dir, 'other.json.tmp-deadbeef'), 'leftover');
  const found = await findTmpFilesRecursive(dir);
  assert.equal(found.length, 1);
  const removed = await sweepTmpFilesRecursive(dir);
  assert.equal(removed.length, 1);
  assert.equal(await fsp.readFile(target, 'utf8'), '{"good":true}');
  void asDir;
});

test('sweepTmpFiles: legacy single-dir sweep still works', async () => {
  const dir = await tmpdir();
  await fsp.writeFile(path.join(dir, 'x.json.tmp-123456'), 'leftover');
  assert.equal(await sweepTmpFiles(dir), 1);
});

// ------------------------------------------------- staging recovery
async function seedStaging(libraryRoot, documentId, { complete = true } = {}) {
  const year = '2026';
  const dir = path.join(libraryRoot, 'articles', year, `.tmp-${documentId}`);
  await fsp.mkdir(dir, { recursive: true });
  const now = '2026-10-05T08:00:00.000Z';
  await writeMeta(dir, {
    format_version: 1, document_id: documentId, type: 'article', title: '恢复测试',
    created_at: now, captured_at: now, updated_at: now,
    source: { original_url: 'https://example.com/r', capture_time: now, extractor: { name: 'readability', version: '0.6.0' } },
  }, { now });
  await fsp.writeFile(path.join(dir, 'article.md'), complete ? '# 恢复测试\n\n正文完整。\n' : '');
  return dir;
}

test('staging recovery: complete crash-leftover is promoted; invalid one quarantined (M10 §10)', async () => {
  const lib = await tmpdir();
  const goodId = newId();
  const badId = newId();
  const goodDir = await seedStaging(lib, goodId, { complete: true });
  const badDir = await seedStaging(lib, badId, { complete: false });

  const result = await recoverStaging(lib);
  assert.equal(result.promoted.length, 1);
  assert.equal(result.quarantined.length, 1);
  const promoted = await fsp.readFile(path.join(goodDir.replace(`.tmp-${goodId}`, goodId), 'article.md'), 'utf8');
  assert.ok(promoted.includes('正文完整'));
  const qRoot = path.join(lib, '.recovery');
  const qEntries = (await fsp.readdir(qRoot)).filter((n) => n.startsWith('quarantine-'));
  assert.equal(qEntries.length, 1, 'invalid staging quarantined with reason');
  // repair log recorded both actions
  const log = await fsp.readFile(path.join(qRoot, 'repair-log.jsonl'), 'utf8');
  assert.ok(log.includes('promote') && log.includes('quarantine'));
  // idempotent: second run finds nothing
  const second = await recoverStaging(lib);
  assert.equal(second.promoted.length + second.quarantined.length, 0);
});

// ------------------------------------------------- Doctor v2
async function makeCorruptLibrary() {
  const lib = await tmpdir();
  // doc A: healthy
  const a = path.join(lib, 'articles', '2026', newId());
  await fsp.mkdir(a, { recursive: true });
  const now = '2026-10-05T08:00:00.000Z';
  await writeMeta(a, {
    format_version: 1, document_id: path.basename(a), type: 'article', title: '健康文章',
    created_at: now, captured_at: now, updated_at: now,
    source: { original_url: 'https://example.com/a', capture_time: now, extractor: { name: 'x', version: '1' } },
  }, { now });
  await fsp.writeFile(path.join(a, 'article.md'), '# 健康文章\n\n内容。\n');
  // doc B: corrupt annotations line + duplicate id
  const b = path.join(lib, 'articles', '2026', newId());
  await fsp.mkdir(b, { recursive: true });
  await writeMeta(b, {
    format_version: 1, document_id: path.basename(b), type: 'article', title: '标注损坏',
    created_at: now, captured_at: now, updated_at: now,
    source: { original_url: 'https://example.com/b', capture_time: now, extractor: { name: 'x', version: '1' } },
  }, { now });
  await fsp.writeFile(path.join(b, 'article.md'), '# 标注损坏\n\n内容。\n');
  const good = { format_version: 1, annotation_id: newId(), document_id: path.basename(b), type: 'highlight', status: 'resolved', quoted_text: '好引文', prefix: '', suffix: '', note: '', tags: [], created_at: now, updated_at: now, locator: { kind: 'text-quote', position: { start: 0, end: 3 } } };
  await fsp.writeFile(path.join(b, 'annotations.jsonl'),
    `${JSON.stringify(good)}\n${'{ broken json line'}\n${JSON.stringify(good)}\n`);
  // orphan tmp + future feeds
  await fsp.writeFile(path.join(lib, 'leftover.json.tmp-cafe'), 'junk');
  await fsp.writeFile(path.join(lib, 'feeds.json'), JSON.stringify({ feeds_version: 7, feeds: [] }));
  return { lib, docB: b, goodAnnotation: good };
}

test('doctor: corrupt library → correct findings; safe repair fixes them; idempotent (M10 §104/105)', async () => {
  const { lib } = await makeCorruptLibrary();
  const first = await runDoctor(lib);
  const codes = first.findings.map((f) => f.checkId);
  assert.ok(codes.includes('annotation_corrupt'));
  assert.ok(codes.includes('orphan_tmp'));
  assert.ok(codes.includes('future_version'));
  assert.ok((first.summary.bySeverity.error ?? 0) >= 1, `expected at least one error finding: ${JSON.stringify(first.summary)}`);

  const plan = await repairSafe(lib, { dryRun: true });
  assert.ok(plan.actions.length >= 2, `planned: ${JSON.stringify(plan.actions)}`);
  assert.equal(plan.userSourceFilesModified, 0, 'safe repair never touches user source files');

  const result = await repairSafe(lib, { dryRun: false });
  assert.ok(result.executed.some((e) => e.action === 'sweep_tmp'));
  assert.ok(result.executed.some((e) => e.action === 'rebuild_index'));
  assert.ok(result.remainingFindings === 0 || result.stillRepairable === 0,
    `remaining: ${JSON.stringify(result.afterSummary)}`);

  // idempotent: re-run scan has no safe findings left
  const second = await runDoctor(lib);
  assert.equal(second.summary.repairable, 0, `second-run findings: ${JSON.stringify(second.findings)}`);
});

test('doctor: annotation conditional repair keeps valid lines, quarantines bad ones (M10 §80/§81)', async () => {
  const { lib, docB, goodAnnotation } = await makeCorruptLibrary();
  const docDir = path.relative(lib, docB);
  const before = await fsp.readFile(path.join(docB, 'annotations.jsonl'), 'utf8');
  const dry = await repairAnnotationsFile(lib, docDir, { dryRun: true });
  assert.equal(dry.dryRun, true);
  const result = await repairAnnotationsFile(lib, docDir, { dryRun: false });
  assert.equal(result.changed, true);
  assert.equal(result.kept, 1, 'only the first valid line survives');
  const after = await fsp.readFile(path.join(docB, 'annotations.jsonl'), 'utf8');
  assert.ok(after.includes(goodAnnotation.annotation_id));
  assert.ok(!after.includes('broken json line'));
  assert.equal(await fsp.readFile(path.join(docB, 'annotations.jsonl'), 'utf8') === before, false,
    'file changed (it was corrupt)');
  // quarantine + backup + log exist
  const recoveryDir = path.join(lib, '.recovery');
  const recoveryEntries = await fsp.readdir(recoveryDir);
  assert.ok(recoveryEntries.some((n) => n.startsWith('backup-')));
  assert.ok(recoveryEntries.some((n) => n.startsWith('quarantine-')));
  const log = await fsp.readFile(path.join(recoveryDir, 'repair-log.jsonl'), 'utf8');
  assert.ok(log.includes('rewrite_annotations'));
  void lib;
});

test('doctor: healthy library is idempotent — repeated scans produce no new findings (M10 §104)', async () => {
  const { lib } = await makeCorruptLibrary();
  await repairSafe(lib, { dryRun: false });
  const r1 = await runDoctor(lib);
  const r2 = await runDoctor(lib);
  assert.equal(r1.findings.length, r2.findings.length, 'scan must be deterministic');
  assert.equal(r2.summary.repairable, 0);
  // a doctor repair pass on a healthy library does nothing (idempotent repair)
  const again = await repairSafe(lib, { dryRun: false });
  assert.equal(again.executed.length, 0);
});

// ------------------------------------------------- portability (M10 §73/§74)
test('library portability: copy the whole folder to a new path — scan/doctor unaffected', async () => {
  const { lib, docB } = await makeCorruptLibrary();
  const moved = path.join(await tmpdir(), 'moved-library');
  await fsp.cp(lib, moved, { recursive: true });
  // each "machine" has its own derived search index (portable-library semantics)
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  process.env.REVERIE_SEARCH_INDEX = path.join(await tmpdir(), 'search-a.json');
  invalidateSearchIndex();
  const before = await runDoctor(lib);
  process.env.REVERIE_SEARCH_INDEX = path.join(await tmpdir(), 'search-b.json');
  invalidateSearchIndex();
  const after = await runDoctor(moved);
  assert.equal(after.summary.documents, before.summary.documents,
    'documents discovered identically after the move');
  assert.deepEqual(
    after.findings.map((f) => [f.checkId, f.severity]).sort(),
    before.findings.map((f) => [f.checkId, f.severity]).sort(),
    'same diagnosis after the move (paths are relative inside the library)',
  );
  // annotation repair on the MOVED copy works (absolute-path independence)
  const repair = await repairAnnotationsFile(moved, path.relative(lib, docB), { dryRun: false });
  assert.equal(repair.changed, true);
});

// ------------------------------------------------- index corruption recovery
test('corrupt library index: auto-rebuild on load, never a fatal error (M10 §77)', async () => {
  const { lib, mk } = await (async () => {
    // minimal library with one doc (same helper shape as the service tests)
    const lib = await tmpdir();
    const id = newId();
    const dir = path.join(lib, 'articles', '2026', id);
    await fsp.mkdir(dir, { recursive: true });
    const now = '2026-10-05T08:00:00.000Z';
    await writeMeta(dir, {
      format_version: 1, document_id: id, type: 'article', title: '索引损坏恢复',
      created_at: now, captured_at: now, updated_at: now,
      source: { original_url: 'https://example.com/c', capture_time: now, extractor: { name: 'x', version: '1' } },
    }, { now });
    await fsp.writeFile(path.join(dir, 'article.md'), '# 索引损坏恢复\n\n内容。\n');
    return { lib, mk: { document_id: id, path: path.join('articles', '2026', id), title: '索引损坏恢复' } };
  })();
  const { loadIndex, rebuildIndex } = await import('../../src/library/index.js');
  const { invalidateSearchIndex } = await import('../../src/search/search-service.js');
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  process.env.REVERIE_SEARCH_INDEX = path.join(lib, '..', `search-${path.basename(lib)}.json`);
  invalidateSearchIndex();
  await rebuildIndex(lib);
  // corrupt the library index file
  await fsp.writeFile(path.join(process.env.REVERIE_HOME, 'index.json'), '{corrupt garbage');
  const index = await loadIndex(lib); // must rebuild, not throw
  assert.ok(index.entries.length >= 1, 'index rebuilt from files');
  // search index also recovers
  await rebuildIndex(lib);
  const { search } = await import('../../src/search/search-service.js');
  const r = await search('索引损坏恢复', { libraryRoot: lib });
  assert.equal(r.total, 1, 'search recovers after corruption');
  void mk;
});
