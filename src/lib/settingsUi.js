/**
 * Settings panel sections and open/close helpers (no store imports).
 * Used by the left-rail hamburger, command palette, and SettingsPanel tabs.
 */

/** @typedef {'connection' | 'apikeys' | 'performance' | 'audio' | 'presets'} SettingsSection */

export const SETTINGS_SECTIONS = Object.freeze([
  'connection',
  'apikeys',
  'performance',
  'audio',
  'presets',
]);

export const SETTINGS_SECTION_LABELS = Object.freeze({
  connection: 'Connection',
  apikeys: 'API keys',
  performance: 'Performance',
  audio: 'Audio',
  presets: 'Presets',
});

/**
 * @param {unknown} section
 * @param {SettingsSection} [fallback='connection']
 * @returns {SettingsSection}
 */
export function resolveSettingsSection(section, fallback = 'connection') {
  return SETTINGS_SECTIONS.includes(/** @type {string} */ (section))
    ? /** @type {SettingsSection} */ (section)
    : fallback;
}

/** True when a stored API key / token is non-empty. */
export function hasSecretValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
