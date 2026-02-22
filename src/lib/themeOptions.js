/**
 * Single source of truth for UI color themes (uiTheme store).
 * Used by Sidebar, CommandPalette, UiThemeSelect, and any layout that shows theme picker.
 */
export const UI_THEME_OPTIONS = [
  { value: 'default', label: 'Default (red)' },
  { value: 'cathedral', label: 'Command Cathedral' },
  { value: 'temporal', label: 'Temporal (Time + Depth)' },
  { value: 'neural', label: 'Neural Observatory (Cyberpunk)' },
  { value: 'signal', label: 'Signal Room' },
];
