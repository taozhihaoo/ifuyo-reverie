/**
 * Extraction Spike runner — evaluates the whole corpus and prints a
 * structured result table (FACT evidence for docs/M0-STATUS.md).
 * Exit code 1 if any check fails.
 */
import { listCorpus, runCategory } from '../../tests/extraction/extraction.test.js';

const categories = await listCorpus();
const rows = [];
let totalChecks = 0;
let failedChecks = 0;

for (const name of categories) {
  const { result, evaluation } = await runCategory(name);
  const a = result.article;
  totalChecks += evaluation.checks.length;
  failedChecks += evaluation.failed.length;
  rows.push({
    category: name,
    verdict: evaluation.verdict.toUpperCase(),
    checks: `${evaluation.checks.length - evaluation.failed.length}/${evaluation.checks.length}`,
    article: a ? 'yes' : 'null',
    title: JSON.stringify(a?.title ?? null),
    byline: JSON.stringify(a?.byline ?? null),
  });
}

const w = [12, 7, 8, 7, 46, 18];
const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(' ');
console.log(line(['category', 'verdict', 'checks', 'article', 'title', 'byline']));
console.log('-'.repeat(100));
for (const r of rows) console.log(line([r.category, r.verdict, r.checks, r.article, r.title, r.byline]));
console.log('-'.repeat(100));
console.log(`categories: ${rows.length}  hard checks: ${totalChecks - failedChecks}/${totalChecks} passed  ` +
  `xpass: ${rows.filter((r) => r.verdict === 'XPASS').length}  xfail: ${rows.filter((r) => r.verdict === 'XFAIL').length}`);

const failed = rows.filter((r) => r.verdict === 'FAIL' || r.verdict === 'XPASS');
if (failed.length > 0) {
  console.log('\nFAILURES:');
  for (const name of failed.map((f) => f.category)) {
    const { evaluation } = await runCategory(name);
    for (const f of evaluation.failed) console.log(`  ${name} :: ${f.name} -> ${f.detail}`);
  }
  process.exit(1);
}
for (const name of rows.filter((r) => r.verdict === 'XFAIL').map((f) => f.category)) {
  const { evaluation } = await runCategory(name);
  console.log(`XFAIL ${name}: ${evaluation.xfailReason}`);
  for (const f of evaluation.failed) console.log(`  ${name} :: ${f.name} -> ${f.detail}`);
}
for (const name of categories) {
  const { evaluation } = await runCategory(name);
  for (const lim of evaluation.limitations) console.log(`LIMITATION ${name}: ${lim}`);
}
