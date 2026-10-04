/**
 * Recovery primitives (M10 §9-§10): crash-leftover sweeping, capture-staging
 * recovery, and the quarantine/backup/log conventions shared by Doctor
 * repairs. Everything here is conservative — user data is moved only into
 * identifiable, restorable locations, and every action is logged to
 * `<libraryRoot>/.recovery/repair-log.jsonl` (M10 §22/§82).
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { appendLine } from '../core/atomic-write.js';
import { readMeta } from '../core/meta.js';

const isTmpName = (name) => name.includes('.tmp-') || /\.tmp$/i.test(name);

/** Recursively collect crash-leftover temp paths under root (bounded walk). */
export async function findTmpFilesRecursive(root, { signal } = {}) {
  const found = [];
  const walk = async (dir, depth) => {
    if (signal?.aborted || depth > 12) return;
    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name.startsWith('.recovery')) continue; // never sweep our own area
        await walk(full, depth + 1);
      } else if (isTmpName(d.name)) {
        found.push(full);
      }
    }
  };
  await walk(root, 0);
  return found;
}

/** Delete crash-leftover temp files. Returns the removed paths. */
export async function sweepTmpFilesRecursive(root, { signal } = {}) {
  const removed = [];
  for (const p of await findTmpFilesRecursive(root, { signal })) {
    if (signal?.aborted) break;
    try {
      await fsp.unlink(p);
      removed.push(p);
    } catch { /* already gone / locked — leave for the next sweep */ }
  }
  return removed;
}

/** staging candidate = articles/<year>/.tmp-<id>/ carrying meta.json + article.md. */
export async function findStagingCandidates(libraryRoot, { signal } = {}) {
  const articlesDir = path.join(libraryRoot, 'articles');
  const candidates = [];
  let years;
  try {
    years = await fsp.readdir(articlesDir, { withFileTypes: true });
  } catch {
    return candidates;
  }
  for (const year of years) {
    if (!year.isDirectory()) continue;
    const yearDir = path.join(articlesDir, year.name);
    let dirs;
    try {
      dirs = await fsp.readdir(yearDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirs) {
      if (signal?.aborted) return candidates;
      if (!d.isDirectory() || !d.name.startsWith('.tmp-')) continue;
      const dir = path.join(yearDir, d.name);
      const candidate = { dir, documentId: d.name.slice('.tmp-'.length), valid: false, problems: [] };
      try {
        const meta = await readMeta(dir);
        candidate.documentId = meta.document_id;
        const md = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
        if (md.trim().length === 0) candidate.problems.push('article.md 为空');
        const target = path.join(articlesDir, year.name, meta.document_id);
        candidate.target = target;
        candidate.exists = await fsp.access(target).then(() => true, () => false);
        if (candidate.exists) candidate.problems.push('目标文档已存在');
        candidate.valid = candidate.problems.length === 0;
      } catch (err) {
        candidate.problems.push(err.message);
      }
      candidates.push(candidate);
    }
  }
  return candidates;
}

function recoveryDir(libraryRoot) {
  return path.join(libraryRoot, '.recovery');
}

/** Append one structured repair record (M10 §22). Failures never throw —
 * the repair log must not turn a successful repair into an error. */
export async function logRepair(libraryRoot, record) {
  try {
    const entry = { repair_id: `r-${Date.now()}-${randomBytes(4).toString('hex')}`, at: new Date().toISOString(), ...record };
    await appendLine(path.join(recoveryDir(libraryRoot), 'repair-log.jsonl'), JSON.stringify(entry));
  } catch { /* logging is best-effort */ }
}

/** Copy `files` (absolute paths) into a timestamped backup folder; returns it. */
export async function backupFiles(libraryRoot, files) {
  const backupDir = path.join(recoveryDir(libraryRoot), `backup-${Date.now()}-${randomBytes(3).toString('hex')}`);
  for (const src of files) {
    const dest = path.join(backupDir, path.basename(src));
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(src, `${dest}`).catch(() => {});
  }
  return backupDir;
}

/**
 * Recover crash-interrupted capture staging dirs (M10 §10): valid ones are
 * promoted to their final location, invalid ones are quarantined with a
 * machine-readable reason. Original bytes are never deleted.
 */
export async function recoverStaging(libraryRoot, { signal } = {}) {
  const promoted = [];
  const quarantined = [];
  for (const candidate of await findStagingCandidates(libraryRoot, { signal })) {
    if (signal?.aborted) break;
    try {
      if (candidate.valid) {
        await fsp.rename(candidate.dir, candidate.target);
        promoted.push({ from: candidate.dir, to: candidate.target, documentId: candidate.documentId });
        await logRepair(libraryRoot, {
          check_id: 'staging_recovery', target: candidate.dir, action: 'promote',
          before: 'crash-leftover staging dir', after: candidate.target, result: 'success',
        });
      } else {
        const qDir = path.join(recoveryDir(libraryRoot), `quarantine-${Date.now()}-${randomBytes(3).toString('hex')}`, path.basename(candidate.dir));
        await fsp.mkdir(path.dirname(qDir), { recursive: true });
        await fsp.rename(candidate.dir, qDir);
        await fsp.writeFile(path.join(qDir, 'quarantine-reason.json'), JSON.stringify({
          from: candidate.dir, problems: candidate.problems, quarantined_at: new Date().toISOString(),
        }, null, 2));
        quarantined.push({ from: candidate.dir, to: qDir, problems: candidate.problems });
        await logRepair(libraryRoot, {
          check_id: 'staging_recovery', target: candidate.dir, action: 'quarantine',
          before: 'invalid staging dir', after: qDir, problems: candidate.problems, result: 'success',
        });
      }
    } catch (err) {
      await logRepair(libraryRoot, {
        check_id: 'staging_recovery', target: candidate.dir, action: 'promote|quarantine',
        result: 'failed', error: err.message,
      });
    }
  }
  return { promoted, quarantined };
}
