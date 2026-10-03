import { promises as fsp } from 'node:fs';
import { appendLine } from '../core/atomic-write.js';
import { parseAnnotationLine, serializeAnnotation } from './annotation.js';

/**
 * Read an annotations.jsonl file.
 * Corruption policy (docs/FORMAT.md §4): a bad line is skipped and reported,
 * never allowed to take down the library, and the file itself is never
 * silently rewritten by a reader.
 */
export async function readAnnotationsFile(filePath) {
  let raw;
  try {
    raw = await fsp.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { annotations: [], invalid: [] };
    throw err;
  }
  const annotations = [];
  const invalid = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    try {
      annotations.push(parseAnnotationLine(line));
    } catch (err) {
      invalid.push({ line: i + 1, reason: err.message });
    }
  }
  return { annotations, invalid };
}

/** Append one annotation as a new line (validate first, fail closed). */
export async function appendAnnotation(filePath, annotation) {
  // parse-back check ensures serialize->parse round-trip before touching disk
  const line = serializeAnnotation(annotation);
  parseAnnotationLine(line);
  await appendLine(filePath, line);
}
