## REPO SEPARATION — READ FIRST
- ATOM Code: ~/atom-code → https://github.com/MrBeeboh/Atom-Code (THIS REPO)
- ATOM Chat: ~/atom-chat → https://github.com/MrBeeboh/Atom-Chat (SEPARATE PRODUCT — never work in atom-chat when tasked with atom-code and vice versa)

---

# ATOM Code — Current State Briefing for Cursor

**Read this at the start of any Cursor session. Do not revert or undo the completed work below.**

## Repos

- **ATOM Code:** `~/atom-code` → https://github.com/MrBeeboh/Atom-Code (THIS REPO)
- **ATOM Chat:** `~/atom-chat` → https://github.com/MrBeeboh/Atom-Chat (SEPARATE — do not confuse)

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

Imports `activePresetName`, strips trailing punctuation from voice transcription, gates voice commands to coding presets only, Phase 12B push-to-talk (hold Space), Phase 12C audio cues (audioReady/audioSuccess/audioError), and run_last uses correct interpreter (python3 -c / node -e / raw).

**Verify:** `grep "activePresetName\|codingPresets\|audioReady\|python3 -c" src/lib/components/ChatInput.svelte` — all four must return results.

### Servers bound to localhost only

- `services/file-server/server.js` — bound to `127.0.0.1` only.
- `services/terminal-server/server.js` — bound to `127.0.0.1` only.

---

## Current restore point tag

`stable-phase12c`

---

## Completed

- **Phase 12B:** Push-to-talk (hold Space to record, release to send; guard when input focused; `onMount` keydown/keyup on window).
- **Phase 12C:** Audio cues (audioReady when mic on, audioSuccess when voice command matches, audioError when transcription empty); run_last uses correct interpreter (python/python3/py → `python3 -c`, javascript/js → `node -e`, else raw).

---

## Next task

TBD (e.g. docs, polish, or next phase).
