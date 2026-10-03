import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeFixtureLibrary, buildIndexFile } from '../../spikes/recovery/run.mjs';
import { scanLibrary, indexFingerprint } from '../../src/library/scan.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-recovery-'));

async function dirHash(root) {
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

test('index recovery: delete -> rescan -> rebuild is identical, sources untouched', async () => {
  const libraryRoot = await tmpdir();
  const appData = await tmpdir();
  await makeFixtureLibrary(libraryRoot);

  const before = await dirHash(libraryRoot);
  const index1 = await buildIndexFile(appData, libraryRoot);
  const fp1 = indexFingerprint(index1);
  assert.equal(index1.entries.length, 2);
  assert.equal(index1.errors.length, 0);

  // simulate total index loss (crash, corruption, migration)
  await fsp.rm(path.join(appData, 'index.json'));

  const index2 = await buildIndexFile(appData, libraryRoot);
  const after = await dirHash(libraryRoot);

  assert.equal(indexFingerprint(index2), fp1, 'rebuilt index must equal original index');
  assert.equal(after, before, 'library files must be byte-identical after rebuild');
});

test('scanner tolerates broken documents without losing the rest', async () => {
  const libraryRoot = await tmpdir();
  const { artDir } = await makeFixtureLibrary(libraryRoot);
  // broken document: invalid meta.json
  const badDir = path.join(libraryRoot, 'articles', '2026', 'broken-doc');
  await fsp.mkdir(badDir, { recursive: true });
  await fsp.writeFile(path.join(badDir, 'meta.json'), '{ nope');

  const { entries, errors } = await scanLibrary(libraryRoot);
  assert.equal(entries.length, 2, 'good documents still indexed');
  assert.ok(errors.some((e) => e.path === badDir), 'broken document reported in errors');
  assert.ok(artDir);
});
