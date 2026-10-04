/**
 * Generate app/build-info.json (M11 §41): version/commit/date for the About
 * and Doctor displays. Run before packaging: `npm run build:info`.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

let commit = null;
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
} catch { /* git unavailable → null */ }

const info = {
  version: pkg.version,
  buildId: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  commit,
  buildDate: new Date().toISOString(),
  configuration: 'release',
  platform: 'windows-x64',
  runtime: `electron@${(() => { try { return JSON.parse(readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version; } catch { return 'unknown'; } })()}`,
};

writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log('build-info written:', JSON.stringify(info));
void existsSync;
