/**
 * Application logging (M11 §33/§34): bounded, levelled, privacy-safe file log
 * for the main process. Release logging records operations and error codes —
 * never document content, notes, credentials, or full network payloads.
 * Rotation: >1 MiB per day-file, keep the 3 most recent.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { appendLine } from './atomic-write.js';
import { getReverieHome } from './paths.js';

const LEVELS = { info: 0, warn: 1, error: 2 };
const MAX_BYTES = 1024 * 1024;
const KEEP = 3;

let minLevel = LEVELS.info;
let today = null;

export function setLogLevel(level) {
  minLevel = LEVELS[level] ?? LEVELS.info;
}

function logDir() {
  return path.join(getReverieHome(), 'logs');
}

function logFile() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.join(logDir(), `reverie-${day}.log`);
}

async function rotateIfNeeded(file) {
  try {
    const stat = await fsp.stat(file);
    if (stat.size <= MAX_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.rename(file, `${file}.${stamp}`);
    const files = (await fsp.readdir(path.dirname(file)))
      .filter((n) => n.startsWith(path.basename(file) + '.') && !n.endsWith('.log'))
      .sort();
    while (files.length > KEEP) {
      await fsp.rm(path.join(path.dirname(file), files.shift()), { force: true });
    }
  } catch { /* rotation is best-effort */ }
}

async function write(level, message) {
  if (LEVELS[level] === undefined || LEVELS[level] < minLevel) return;
  const file = logFile();
  if (today !== path.basename(file)) {
    today = path.basename(file);
    await rotateIfNeeded(file);
  }
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    msg: String(message).slice(0, 2000),
  });
  try {
    await appendLine(file, line);
  } catch { /* logging must never crash the app */ }
}

export const appLog = {
  info: (m) => write('info', m),
  warn: (m) => write('warn', m),
  error: (m) => write('error', m),
};

/** Log directory for diagnostics ("打开日志文件夹"). */
export function logsDir() {
  return logDir();
}
