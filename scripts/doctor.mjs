/** `npm run doctor` — CLI consistency check over the current library. */
import { getLibraryRoot } from '../src/core/paths.js';
import { runDoctor } from '../src/library/doctor.js';

const libraryRoot = getLibraryRoot();
console.log(`Reverie Doctor — library: ${libraryRoot}\n`);
const { ok, findings, stats } = await runDoctor(libraryRoot);
console.log(`documents: ${stats.documents}  indexed: ${stats.index_documents ?? 'N/A'}`);
if (findings.length === 0) {
  console.log('no findings — library is consistent.');
} else {
  for (const f of findings) {
    console.log(`${f.severity === 'error' ? '[ERROR]  ' : '[WARNING]'} ${f.code}: ${f.detail}`);
  }
  console.log(`\n${findings.length} finding(s).`);
}
process.exit(ok ? 0 : 1);
