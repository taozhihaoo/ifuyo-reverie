import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Atomic file write: tmp file -> flush/fsync -> rename over the target.
 * A crash can only ever leave a `*.tmp-*` leftover behind, never a half-written
 * target file. Leftover tmp files are never read back and can be swept later.
 */
export async function writeFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${path.basename(filePath)}.tmp-${randomBytes(6).toString('hex')}`);
  const handle = await fsp.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  } finally {
    await handle.close();
  }
  try {
    await fsp.rename(tmp, filePath);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
}

/** Append one line (JSONL) with an fsync. A crash may truncate the very last
 * line only; readers must tolerate and skip unparsable trailing lines. */
export async function appendLine(filePath, line) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fsp.open(filePath, 'a');
  try {
    await handle.writeFile(line + '\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Remove leftover `*.tmp-*` files from a directory (crash sweep). */
export async function sweepTmpFiles(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (name.includes('.tmp-')) {
      await fsp.unlink(path.join(dir, name)).then(() => removed++).catch(() => {});
    }
  }
  return removed;
}
