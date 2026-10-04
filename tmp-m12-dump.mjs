import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = os.tmpdir();
const dirs = (await fsp.readdir(base)).filter((d) => d.startsWith('reverie-m12-')).sort();
const d = dirs[dirs.length - 1];
const lib = path.join(base, d, 'library');
console.log('== tmp:', d);
for (const p of [path.join(lib, 'articles', '2026'), path.join(base, d, 'home')]) {
  try {
    console.log('==', p);
    for (const e of await fsp.readdir(p, { withFileTypes: true })) {
      console.log('  ', e.isDirectory() ? '[dir]' : '[file]', e.name);
      if (e.isDirectory()) {
        for (const f of await fsp.readdir(path.join(p, e.name))) console.log('      ', f);
      }
    }
  } catch (err) { console.log('  ERR', err.message); }
}
try {
  const idx = JSON.parse(await fsp.readFile(path.join(base, d, 'home', 'index.json'), 'utf8'));
  console.log('== index entries:', idx.entries.map((e) => `${e.document_id.slice(0, 8)} ${e.path}`));
} catch (err) { console.log('index ERR', err.message); }
