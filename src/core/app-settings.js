/**
 * Application settings (M11 §10/§29/§30): the app-runtime preference file that
 * lives in REVERIE_HOME, separate from the user-owned Library. Stores the
 * library path selection and window state. Corruption → fall back to defaults
 * (§53: preferences are non-critical — resetting them must never touch the
 * Library). Unknown/future fields are preserved on rewrite (§27).
 *
 * Precedence for the library root: REVERIE_LIBRARY env (tests/advanced) >
 * settings.libraryPath (M11 UI selection) > <home>/library default.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic-write.js';
import { getReverieHome } from './paths.js';

export const SETTINGS_VERSION = 1;

export function appSettingsPath() {
  return process.env.REVERIE_SETTINGS ?? path.join(getReverieHome(), 'app-settings.json');
}

const DEFAULTS = () => ({
  settings_version: SETTINGS_VERSION,
  libraryPath: null, // user-selected library root (null → default under home)
  window: null, // { x, y, width, height, maximized }
});

/** Load settings; any corruption falls back to defaults (never throws). */
export async function loadAppSettings() {
  try {
    const raw = JSON.parse(await fsp.readFile(appSettingsPath(), 'utf8'));
    if (typeof raw !== 'object' || raw === null) return DEFAULTS();
    const settings = { ...DEFAULTS(), ...raw };
    if (typeof settings.libraryPath !== 'string' || settings.libraryPath.trim() === '') {
      settings.libraryPath = null;
    }
    if (typeof settings.window !== 'object' || settings.window === null) settings.window = null;
    return settings;
  } catch {
    return DEFAULTS();
  }
}

/** Atomic save; merges over the loaded file to preserve unknown fields (§27). */
export async function saveAppSettings(patch) {
  const current = await loadAppSettings();
  const next = { ...current, ...patch, settings_version: SETTINGS_VERSION };
  await writeFileAtomic(appSettingsPath(), JSON.stringify(next, null, 2));
  return next;
}
