import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArticle } from '../../src/extraction/extract.js';
import { evaluateExtraction } from '../../src/extraction/evaluate.js';

const corpusDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus');

/** List corpus categories (a dir = one category, holding input.html + expected.json). */
export async function listCorpus() {
  const entries = await fsp.readdir(corpusDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export async function runCategory(name) {
  const dir = path.join(corpusDir, name);
  const html = await fsp.readFile(path.join(dir, 'input.html'), 'utf8');
  const expected = JSON.parse(await fsp.readFile(path.join(dir, 'expected.json'), 'utf8'));
  const result = extractArticle(html, { url: expected.canonical ?? `https://corpus.reverie.local/${name}/` });
  return { result, expected, evaluation: evaluateExtraction(result, expected) };
}

test('extraction corpus', async (t) => {
  const categories = await listCorpus();
  assert.ok(categories.length >= 13, `corpus should have >= 13 categories, has ${categories.length}`);
  for (const name of categories) {
    await t.test(`category: ${name}`, async () => {
      const { evaluation } = await runCategory(name);
      if (evaluation.verdict === 'xpass') {
        // a known failure started passing: upgrade the fixture expectation
        assert.fail(`XPASS: ${evaluation.xfailReason}`);
      }
      if (evaluation.verdict === 'fail') {
        const failed = evaluation.failed.map((f) => `${f.name} (${f.detail})`);
        assert.deepEqual(failed, [], `${name}: ${evaluation.failed.length} check(s) failed`);
      }
      assert.ok(['pass', 'xfail'].includes(evaluation.verdict), `unexpected verdict ${evaluation.verdict}`);
    });
  }
});
