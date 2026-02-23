# ATOM Code — Current State Briefing for Cursor

**Read this at the start of any Cursor session. Do not revert or undo the completed work below.**

---

## Do NOT modify these files under any circumstances

- `start-atom-code.sh`
- `voice-server/` (entire directory)
- `vite.config.js`
- `src/lib/api.js`
- `scripts/search-proxy.mjs`

---

## What is complete and working — do not revert

### `src/lib/stores.js`

Contains `activePresetName` writable store.

**Verify:** `grep "activePresetName" src/lib/stores.js` — must return a result.

### `src/lib/components/PresetSelect.svelte`

Imports and sets `activePresetName` on load and on every preset change.

**Verify:** `grep "activePresetName" src/lib/components/PresetSelect.svelte` — must return 2 results.

### `src/lib/components/ChatInput.svelte`

Imports `activePresetName`, strips trailing punctuation from voice transcription, and gates voice commands to coding presets only.

**Verify:** `grep "activePresetName\|codingPresets" src/lib/components/ChatInput.svelte` — must return results.

### Servers bound to localhost only

- `services/file-server/server.js` — bound to `127.0.0.1` only.
- `services/terminal-server/server.js` — bound to `127.0.0.1` only.

---

## Current restore point tag

`stable-phase12a-presetfix-hardened`

---

## Next task — Phase 12B: Push-to-talk

Add **hold-spacebar-to-record** to `src/lib/components/ChatInput.svelte` only.

- **Hold Space** = start recording
- **Release Space** = stop recording
- **Guard:** Do not trigger if `document.activeElement` is an input, textarea, or contenteditable element.
- Use `onMount` to attach/detach the keydown/keyup listeners on `window`.
- **Do not touch any other files.**
