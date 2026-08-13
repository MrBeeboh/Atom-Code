import { describe, it, expect } from 'vitest'
import {
  SETTINGS_SECTIONS,
  resolveSettingsSection,
  hasSecretValue,
} from './settingsUi.js'

describe('settingsUi', () => {
  it('resolves known sections and falls back for invalid ones', () => {
    expect(resolveSettingsSection('apikeys')).toBe('apikeys')
    expect(resolveSettingsSection('connection')).toBe('connection')
    expect(resolveSettingsSection('not-a-tab')).toBe('connection')
    expect(resolveSettingsSection(null, 'audio')).toBe('audio')
    expect(SETTINGS_SECTIONS).toContain('apikeys')
  })

  it('detects whether a secret field has a value', () => {
    expect(hasSecretValue('sk-test')).toBe(true)
    expect(hasSecretValue('   ')).toBe(false)
    expect(hasSecretValue('')).toBe(false)
    expect(hasSecretValue(null)).toBe(false)
  })
})
