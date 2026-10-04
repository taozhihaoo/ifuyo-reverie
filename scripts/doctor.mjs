/** `npm run doctor [-- --repair]` — CLI health scan over the current library
 * (M10). `--repair` previews then executes the SAFE repairs; everything else
 * is reported for manual handling. Exit 0 = healthy, 1 = findings remain. */
import { getLibraryRoot } from '../src/core/paths.js';
import { runDoctor, repairSafe } from '../src/library/doctor.js';

const libraryRoot = getLibraryRoot();
const doRepair = process.argv.includes('--repair');

console.log(`Reverie Doctor — library: ${libraryRoot}\n`);
const { ok, summary, findings } = await runDoctor(libraryRoot);
console.log(`documents: ${summary.documents}  checks: ${summary.checks}`);
console.log(`findings: ${summary.findings}  (error ${summary.bySeverity.error ?? 0} / warning ${summary.bySeverity.warning ?? 0} / info ${summary.bySeverity.info ?? 0})  repairable(safe): ${summary.repairable}`);

if (findings.length > 0) {
  console.log('');
  for (const f of findings) {
    const tag = { critical: '[CRIT]  ', error: '[ERROR] ', warning: '[WARN]  ', info: '[INFO]  ' }[f.severity] ?? '[?]     ';
    console.log(`${tag} ${f.checkId}: ${f.problem}${f.path ? `  (${f.path})` : ''}`);
    if (f.suggestedAction) console.log(`         -> ${f.suggestedAction}`);
  }
}

if (doRepair) {
  const plan = await repairSafe(libraryRoot, { dryRun: true });
  console.log(`\nsafe repair plan: ${plan.actions.length} action(s)  (user source files modified: ${plan.userSourceFilesModified})`);
  for (const a of plan.actions) console.log(`  - ${a.action}: ${a.target}`);
  if (plan.actions.length > 0) {
    const result = await repairSafe(libraryRoot, { dryRun: false });
    console.log('\nrepair executed:');
    for (const e of result.executed) console.log(`  ok ${e.action}`, Object.entries(e).filter(([k]) => k !== 'action').map(([k, v]) => `${k}=${v}`).join(' '));
    console.log(`remaining repairable: ${result.remainingFindings}`);
  } else {
    console.log('nothing to repair.');
  }
}

process.exit(ok ? 0 : 1);
