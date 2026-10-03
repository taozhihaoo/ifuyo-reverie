import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalTag, normalizeTags, loadUserState, updateUserState, stateOf,
  forgetDocument, resetCacheForTests, userStatePath, MAX_TAG_LENGTH,
} from '../../src/library/user-state.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m3state-'));

// each test gets an isolated REVERIE_LIBRARY (state file lives inside it)
const withEnv = async (fn) => {
  const lib = await tmpdir();
  const prevLib = process.env.REVERIE_LIBRARY;
  const prevState = process.env.REVERIE_USER_STATE;
  process.env.REVERIE_LIBRARY = lib;
  delete process.env.REVERIE_USER_STATE;
  resetCacheForTests();
  try {
    await fn(lib);
  } finally {
    if (prevLib === undefined) delete process.env.REVERIE_LIBRARY; else process.env.REVERIE_LIBRARY = prevLib;
    if (prevState === undefined) delete process.env.REVERIE_USER_STATE; else process.env.REVERIE_USER_STATE = prevState;
    resetCacheForTests();
  }
};

test('canonicalTag: trim, dedupe keys, reject empty/oversized/control (M3 §15/16)', () => {
  assert.deepEqual(canonicalTag('  Rust  '), { key: 'rust', display: 'Rust' });
  assert.deepEqual(canonicalTag('RUST'), { key: 'rust', display: 'RUST' });
  assert.equal(canonicalTag(''), null);
  assert.equal(canonicalTag('   '), null);
  assert.equal(canonicalTag('a\u0000b'), null);
  assert.equal(canonicalTag('x'.repeat(MAX_TAG_LENGTH + 1)), null);
  // " Rust " and "Rust" must not become two unpredictable tags
  assert.equal(canonicalTag(' Rust ').key, canonicalTag('Rust').key);
});

test('normalizeTags dedupes case-insensitively keeping the first display form', () => {
  assert.deepEqual(normalizeTags(['Rust', 'rust', 'RUST', ' AI ', 'ai']), ['Rust', 'AI']);
  assert.deepEqual(normalizeTags(['', '  ', null, 42]), []);
});

test('defaults: unread / not favorite / in inbox / no tags (M3 §10)', async () => {
  await withEnv(async () => {
    const s = await loadUserState();
    const state = stateOf(s, 'doc-1');
    assert.deepEqual(state, {
      read: false, favorite: false, inbox: true, tags: [],
      last_opened_at: null, last_read_at: null,
    });
  });
});

test('updateUserState: read/favorite/inbox are independent (M3 §9/11)', async () => {
  await withEnv(async (lib) => {
    await updateUserState('doc-1', { read: true, favorite: true, inbox: true });
    let s = stateOf(await loadUserState(), 'doc-1');
    assert.equal(s.read && s.favorite && s.inbox, true);
    // mark read must NOT auto-remove from inbox (M3 §11/134)
    await updateUserState('doc-1', { read: true, favorite: false });
    s = stateOf(await loadUserState(), 'doc-1');
    assert.equal(s.read, true);
    assert.equal(s.inbox, true);
    assert.equal(s.favorite, false);
    // persisted to the library dir
    const raw = JSON.parse(await fsp.readFile(userStatePath(), 'utf8'));
    assert.equal(raw.states['doc-1'].read, true);
    assert.ok(userStatePath().startsWith(lib));
  });
});

test('last_opened_at drives Recent without touching created/captured (M3 §37)', async () => {
  await withEnv(async () => {
    await updateUserState('doc-old', { last_opened_at: '2026-10-05T09:00:00.000Z' });
    const s = stateOf(await loadUserState(), 'doc-old');
    assert.equal(s.last_opened_at, '2026-10-05T09:00:00.000Z');
  });
});

test('tags add/remove round-trip through the state file (M3 §17)', async () => {
  await withEnv(async () => {
    await updateUserState('doc-1', { tags: [' Rust ', 'AI'] });
    let s = stateOf(await loadUserState(), 'doc-1');
    assert.deepEqual(s.tags, ['Rust', 'AI']);
    // duplicate (case-insensitive) does not create a second tag (M3 §81)
    await updateUserState('doc-1', { tags: [...s.tags, 'rust'] });
    s = stateOf(await loadUserState(), 'doc-1');
    assert.deepEqual(s.tags, ['Rust', 'AI']);
  });
});

test('forgetDocument removes the entry', async () => {
  await withEnv(async () => {
    await updateUserState('doc-1', { favorite: true });
    assert.equal(await forgetDocument('doc-1'), true);
    assert.equal(await forgetDocument('doc-1'), false);
    const s = stateOf(await loadUserState(), 'doc-1');
    assert.equal(s.favorite, false);
  });
});

test('torn state file falls back to defaults without crashing the library (M3 §99)', async () => {
  await withEnv(async (lib) => {
    await updateUserState('doc-1', { favorite: true });
    await fsp.writeFile(userStatePath(), '{ torn json');
    resetCacheForTests();
    const s = await loadUserState();
    assert.equal(stateOf(s, 'doc-1').favorite, false, 'torn file cannot pretend to hold data');
    // library still fully usable
    await updateUserState('doc-2', { read: true });
    assert.equal(stateOf(await loadUserState(), 'doc-2').read, true);
  });
});

test('legacy read-state.json migrates into user-state.json (M1 -> M3)', async () => {
  await withEnv(async (lib) => {
    const legacy = {
      read_state_version: 1,
      states: {
        'doc-legacy': { state: 'read', updated_at: '2026-10-01T00:00:00.000Z' },
      },
    };
    await fsp.writeFile(path.join(lib, '..', 'legacy-home', 'read-state.json'), JSON.stringify(legacy), { recursive: true }).catch(() => {});
    // place the legacy file where paths.js looks for it: simulate by env REVERIE_HOME
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-home-'));
    await fsp.writeFile(path.join(home, 'read-state.json'), JSON.stringify(legacy));
    const prevHome = process.env.REVERIE_HOME;
    process.env.REVERIE_HOME = home;
    resetCacheForTests();
    try {
      const s = await loadUserState();
      assert.equal(stateOf(s, 'doc-legacy').read, true);
      const persisted = JSON.parse(await fsp.readFile(userStatePath(), 'utf8'));
      assert.equal(persisted.states['doc-legacy'].read, true);
    } finally {
      if (prevHome === undefined) delete process.env.REVERIE_HOME; else process.env.REVERIE_HOME = prevHome;
      resetCacheForTests();
    }
  });
});
