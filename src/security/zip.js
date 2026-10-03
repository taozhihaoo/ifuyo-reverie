/**
 * ZIP / EPUB extraction guards (Security Baseline, M0 §29).
 * Covers Zip Slip (path traversal), absolute/UNC paths, drive letters,
 * NUL bytes, entry-count bombs and compression bombs.
 */
import path from 'node:path';

export const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 20_000,
  maxEntryBytes: 1024 * 1024 * 1024, // 1 GiB per entry
  maxTotalBytes: 4 * 1024 * 1024 * 1024, // 4 GiB total
  maxCompressionRatio: 1000, // suspicious if exceeded on a large entry
  ratioMinBytes: 10 * 1024 * 1024, // ratio rule applies from 10 MiB up
});

/** True if `entryName` can be safely joined under `baseDir`. */
export function isSafeEntryName(entryName) {
  if (typeof entryName !== 'string' || entryName.length === 0 || entryName.length > 1024) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(entryName)) return false; // NUL & control chars
  if (/^[a-zA-Z]:/.test(entryName)) return false; // Windows drive letter
  if (/^\\\\|\/\/@/.test(entryName)) return false; // UNC / weird prefix
  if (/^[\\/]/.test(entryName)) return false; // absolute path
  // every path component must be sane; '.' and '..' anywhere are rejected
  const parts = entryName.split(/[\\/]/);
  if (parts.some((p) => p === '..' || p === '.')) return false;
  return true;
}

/**
 * Resolve an entry name inside `baseDir` or throw.
 * Returns the absolute target path guaranteed to stay under baseDir.
 */
export function safeEntryPath(baseDir, entryName) {
  if (!isSafeEntryName(entryName)) {
    throw new Error(`unsafe zip entry name: ${JSON.stringify(entryName)}`);
  }
  const target = path.resolve(baseDir, entryName);
  const base = path.resolve(baseDir);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`zip entry escapes base dir: ${JSON.stringify(entryName)}`);
  }
  return target;
}

/**
 * Validate a ZIP central directory (array of { filename, compressedSize,
 * uncompressedSize }) before any extraction. Throws on violation.
 */
export function validateZipEntries(entries, limits = DEFAULT_LIMITS) {
  if (entries.length > limits.maxEntries) {
    throw new Error(`zip has too many entries: ${entries.length} > ${limits.maxEntries}`);
  }
  let total = 0;
  for (const e of entries) {
    if (!isSafeEntryName(e.filename)) {
      throw new Error(`unsafe zip entry name: ${JSON.stringify(e.filename)}`);
    }
    if (e.uncompressedSize > limits.maxEntryBytes) {
      throw new Error(`zip entry too large: ${e.filename} (${e.uncompressedSize} bytes)`);
    }
    total += e.uncompressedSize;
    if (total > limits.maxTotalBytes) {
      throw new Error(`zip total uncompressed size exceeds ${limits.maxTotalBytes} bytes`);
    }
    if (e.uncompressedSize > limits.ratioMinBytes &&
        e.compressedSize > 0 &&
        e.uncompressedSize / e.compressedSize > limits.maxCompressionRatio) {
      throw new Error(`compression bomb suspected: ${e.filename} ratio ${Math.round(e.uncompressedSize / e.compressedSize)}`);
    }
  }
  return { ok: true, entries: entries.length, totalBytes: total };
}
