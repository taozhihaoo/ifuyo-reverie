/**
 * Search regression suite (M3 §121): search-regression.json records
 * query -> expected document numbers + expected match types. Changing the
 * tokenizer, ranking, or index format must keep this green or consciously
 * update the fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './corpus.mjs';
import { loadSearchIndex, search, invalidateSearchIndex } from '../../src/search/search-service.js';
import { resetCacheForTests } from '../../src/library/user-state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-regression-'));
const nToId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('search regression suite', async () => {
  resetCacheForTests();
  const lib = await tmpdir();
  await buildCorpus(lib);
  await loadSearchIndex(lib);

  const cases = JSON.parse(await fsp.readFile(path.join(here, '..', 'fixtures', 'search', 'search-regression.json'), 'utf8'));
  assert.ok(cases.length >= 8, 'regression fixture should stay substantial');

  for (const c of cases) {
    const res = await search(c.query, { libraryRoot: lib });
    assert.equal(res.error ?? null, null, `query "${c.query}" should parse`);
    const gotIds = res.results.map((r) => Number(r.document_id.slice(-12))).sort((a, b) => a - b);
    const expected = c.expect_doc_n.slice().sort((a, b) => a - b);
    assert.deepEqual(gotIds, expected, `query "${c.query}" document set regressed`);
    if (c.expect_match_types.length > 0) {
      assert.ok(res.results.length > 0, `query "${c.query}" expected matches`);
      const types = new Set(res.results[0].matches.map((m) => m.type));
      for (const t of c.expect_match_types) {
        assert.ok(types.has(t), `query "${c.query}": expected match type "${t}", got [${[...types]}]`);
      }
    }
  }
});
