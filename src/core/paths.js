/**
 * Reverie filesystem layout (M1).
 *
 * REVERIE_HOME (default: %LOCALAPPDATA%/Reverie on Windows, ~/.reverie elsewhere)
 *   ├─ library/      user data — Source of Truth ( movable, user-selectable later )
 *   ├─ queue/        persistent capture queue (one JSON file per job)
 *   ├─ index.json    derived index (rebuildable from library)
 *   └─ read-state.json  derived app state (never written into the library)
 *
 * Overrides: env REVERIE_HOME, REVERIE_LIBRARY.
 */
import os from 'node:os';
import path from 'node:path';

export function getReverieHome() {
  return process.env.REVERIE_HOME
    ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.reverie'), 'Reverie');
}

export function getLibraryRoot() {
  return process.env.REVERIE_LIBRARY ?? path.join(getReverieHome(), 'library');
}

export function getQueueDir() {
  return path.join(getReverieHome(), 'queue');
}

export function getIndexPath() {
  return path.join(getReverieHome(), 'index.json');
}

export function getReadStatePath() {
  return path.join(getReverieHome(), 'read-state.json');
}
