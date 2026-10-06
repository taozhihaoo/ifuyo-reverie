/**
 * M11 Release packaging (portable baseline): assembles a self-contained
 * Windows portable build from the LOCAL environment — zero network needed.
 *
 * Output: artifacts/Reverie-<version>-portable-win-x64/
 *   Reverie.exe            (renamed Electron runtime)
 *   resources/app/         package.json + app/ + src/ + runtime node_modules
 * plus Reverie-<version>-portable-win-x64.zip, checksums.txt and
 * release-manifest.json in artifacts/.
 *
 * Runtime node_modules are resolved from the EXISTING node_modules tree
 * (`npm ls --omit=dev --parseable`), so no network install is required.
 */
import { execSync } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const outRoot = path.join(root, 'artifacts');
const appDir = path.join(outRoot, `Reverie-${version}-portable-win-x64`);
const resourcesApp = path.join(appDir, 'resources', 'app');

const bytes = (p) => readFileSync(p);
const walkFiles = async (dir, filter = () => true) => {
  const out = [];
  const walk = async (d) => {
    for (const dirent of await fsp.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, dirent.name);
      if (dirent.isDirectory()) await walk(full);
      else if (filter(full)) out.push(full);
    }
  };
  await walk(dir);
  return out;
};
const copyDir = async (src, dest, filter = () => true) => {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  for (const f of await walkFiles(src, filter)) {
    const target = path.join(dest, path.relative(src, f));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(f, target);
  }
};

console.log('== M11 portable packaging ==');
if (!existsSync(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
  throw new Error('electron runtime not installed — run npm install first');
}

// 0. build metadata
execSync('node scripts/write-build-info.mjs', { cwd: root, stdio: 'inherit' });

// 1. clean staging
await fsp.rm(appDir, { recursive: true, force: true });
await fsp.mkdir(resourcesApp, { recursive: true });

// 2. Electron runtime → app root (Reverie.exe)
await copyDir(path.join(root, 'node_modules', 'electron', 'dist'), appDir);
await fsp.rename(path.join(appDir, 'electron.exe'), path.join(appDir, 'Reverie.exe'));

// 3. application code → resources/app
const pkgForRelease = { ...pkg };
delete pkgForRelease.devDependencies;
delete pkgForRelease.scripts;
await fsp.writeFile(path.join(resourcesApp, 'package.json'), JSON.stringify(pkgForRelease, null, 2));
await copyDir(path.join(root, 'app'), path.join(resourcesApp, 'app'));
await copyDir(path.join(root, 'src'), path.join(resourcesApp, 'src'));
await fsp.copyFile(path.join(root, 'build-info.json'), path.join(resourcesApp, 'build-info.json'));

// 4. runtime node_modules: production closure resolved from the local tree
const lsOut = execSync('npm ls --omit=dev --all --parseable --long=false', { cwd: root, encoding: 'utf8' });
const prodPkgs = [...new Set(lsOut.split(/\r?\n/).filter(Boolean))];
const runtimeRoot = path.join(resourcesApp, 'node_modules');
for (const pkgDir of prodPkgs) {
  const rel = path.relative(path.join(root, 'node_modules'), pkgDir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // skip non-local entries
  await copyDir(pkgDir, path.join(runtimeRoot, rel));
}

// 4b. prune (M11 §87: shipped size matters; every prune keeps a runtime need)
// - @napi-rs/canvas: pdfjs optional dep, pulled in by the closure but unused —
//   the main process only extracts text (no canvas rendering)
await fsp.rm(path.join(runtimeRoot, '@napi-rs'), { recursive: true, force: true });
// - pdfjs-dist: keep only the legacy build the main process imports + its
//   standard fonts (CJK text extraction) — renderer uses app/vendor/pdfjs
const pjs = path.join(runtimeRoot, 'pdfjs-dist');
for (const sub of ['build', 'web', 'types', 'cmaps', 'wasm', 'legacy/web']) {
  await fsp.rm(path.join(pjs, ...sub.split('/')), { recursive: true, force: true });
}
for (const e of await fsp.readdir(path.join(pjs, 'legacy', 'build')).catch(() => [])) {
  if (!/^pdf(\.min)?\.mjs$/.test(e) && !e.endsWith('.map')) {
    await fsp.rm(path.join(pjs, 'legacy', 'build', e), { force: true });
  }
}
// - Electron locales: keep only the languages Reverie ships (M11 §87)
const localesDir = path.join(appDir, 'locales');
if (existsSync(localesDir)) {
  const keepLocales = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak', 'en-GB.pak']);
  for (const f of await fsp.readdir(localesDir)) {
    if (!keepLocales.has(f)) await fsp.rm(path.join(localesDir, f), { force: true });
  }
}
// - Electron's default app: replaced by Reverie resources
await fsp.rm(path.join(appDir, 'resources', 'default_app.asar'), { force: true });

// 5. zip (DEFLATE; entries carry the build date so archives don't show the
// 1980 DOS epoch; SOURCE_DATE_EPOCH env honored for reproducible builds)
const appFiles = (await walkFiles(appDir)).sort();
const zipPath = path.join(outRoot, `Reverie-${version}-portable-win-x64.zip`);
await fsp.rm(zipPath, { force: true });
{
  const buildTime = process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000)
    : new Date();
  const dosTime = ((buildTime.getHours() << 11) | (buildTime.getMinutes() << 5) | Math.floor(buildTime.getSeconds() / 2)) & 0xffff;
  const dosDate = (((buildTime.getFullYear() - 1980) << 9) | ((buildTime.getMonth() + 1) << 5) | buildTime.getDate()) & 0xffff;
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32local = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = (c >>> 8) ^ crcTable[(c ^ b) & 0xff];
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const f of appFiles) {
    const data = await fsp.readFile(f);
    const nameInZip = path.relative(appDir, f).replace(/\\/g, '/');
    const nameBytes = enc.encode(nameInZip);
    const compressed = deflateRawSync(data, { level: 6 });
    const crc = crc32local(data);
    const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 8, true); // DEFLATE
    dv.setUint16(10, dosTime, true); // mod time
    dv.setUint16(12, dosDate, true); // mod date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, compressed.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    Buffer.from(compressed).copy(local, 30 + nameBytes.length);
    chunks.push(local);
    const cd = Buffer.alloc(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 8, true);
    cdv.setUint16(12, dosTime, true);
    cdv.setUint16(14, dosDate, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, compressed.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = Buffer.alloc(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, appFiles.length, true);
  edv.setUint16(10, appFiles.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  await fsp.writeFile(zipPath, Buffer.concat([...chunks, ...central, eocd]));
}

// 6. checksums + manifest
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const artifacts = [`Reverie-${version}-portable-win-x64.zip`];
const checksumLines = [];
const checksums = {};
for (const name of artifacts) {
  const buf = await fsp.readFile(path.join(outRoot, name));
  const hash = sha256(buf);
  checksums[name] = { sha256: hash, size: buf.length };
  checksumLines.push(`${hash}  ${name}  ${buf.length} bytes  v${version}`);
}
await fsp.writeFile(path.join(outRoot, 'checksums.txt'), checksumLines.join('\n') + '\n');
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; } })();
await fsp.writeFile(path.join(outRoot, 'release-manifest.json'), JSON.stringify({
  product: 'ifuyo Reverie',
  version,
  platform: 'windows-x64',
  commit,
  buildDate: new Date().toISOString(),
  configuration: 'release',
  artifacts,
  checksums,
  signing: 'unsigned',
}, null, 2) + '\n');

const sizeMb = Math.round((await fsp.stat(zipPath)).size / 1024 / 1024);
console.log(`== done: ${zipPath} (${sizeMb} MB), ${appFiles.length} files, checksums + manifest written ==`);
