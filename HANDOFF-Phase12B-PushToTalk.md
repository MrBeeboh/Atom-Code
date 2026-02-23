# ATOM Code — Handoff Document
## Date: February 23, 2026

## What Is ATOM Code
Voice-first local coding assistant. Svelte 5 frontend, LM Studio backend, all local. No cloud required.

**Repo:** https://github.com/MrBeeboh/Atom-Code
**Stack:** Svelte 5, Vite, Tailwind CSS 4, Dexie.js, xterm.js, CodeMirror 6, Node.js services, Python/FastAPI voice server
**Services:** Terminal (8767), File (8768), Voice (8765), Search (5174), LM Studio (1234), Vite (5173)

---

## Current State — What's Done

### Phases Complete (1-11)
- Chat with local AI models via LM Studio
- Voice input (faster-whisper, int8 quantization, ~1.5GB VRAM, large-v3-turbo)
- Integrated terminal (xterm.js + node-pty)
- File explorer with pinning for context
- Code block actions (copy, run, save, apply/diff)
- Quick actions + coding presets
- Model switching, performance stats, context ring
- Error feedback loop (Phase 8)
- Codebase awareness / repo map (Phase 9)
- GitHub fetch/clone (Phase 10)
- Code editor panel with CodeMirror 6, tabbed bottom panel (Phase 11)

### Phase 12-0: Voice Engine Upgrade ✅
- Switched from HuggingFace Transformers to faster-whisper
- INT8 quantization, ~1.5GB VRAM
- voice-server/app.py uses faster_whisper.WhisperModel

### Context Trimming Fix ✅
- ChatView.svelte: replaced hardcoded contextMax = 100000 with dynamic detection
- Priority: user setting → contextUsage store → 8192 fallback
- Fixed the 400 Bad Request on Code preset with Qwen 2.5 Coder 14B

### Phase 12A: Voice Commands ✅ COMPLETE
**Git tag: stable-phase12a-presetfix**

**What works:**
- "run it" / "run that" / "run the code" → executes last code block in terminal
- "apply it" / "apply that" → opens diff viewer
- "fix it" / "fix the error" → sends error context to AI
- "show terminal" / "hide terminal" / "show editor" / "hide editor" → UI control
- Voice commands ONLY active in: Code, Debug, Review, Refactor, Explain presets
- Voice commands DISABLED in General preset (text goes to chat normally)

**Key files changed:**
- src/lib/stores.js — added activePresetName writable store
- src/lib/components/PresetSelect.svelte — sets activePresetName on load and on change
- src/lib/components/ChatInput.svelte — strips trailing punctuation, guards commands by preset

**CURSOR WARNING:** Cursor repeatedly reverts these changes. After any Cursor session verify:
```
grep "activePresetName" ~/atom-code/src/lib/components/ChatInput.svelte
grep "activePresetName" ~/atom-code/src/lib/stores.js
```
Both must return results. If either returns nothing — restore from tag immediately.

---

## Phase 12 Roadmap
- 12A: Voice commands ✅ DONE
- 12B: Push-to-talk (hold spacebar to record, release to send) ← YOU ARE HERE
- 12C: Audio cues (success chime, error tone, ready ping via Web Audio API)

---

## Phase 12B: Push-to-Talk — NEXT

Hold Spacebar to record, release to send. No more click mic / click to stop.
All changes go in: src/lib/components/ChatInput.svelte

```javascript
function handleKeyDown(e) {
  if (e.code === 'Space' && !e.repeat && !isInputFocused()) {
    e.preventDefault();
    if (!isRecording) startRecording();
  }
}
function handleKeyUp(e) {
  if (e.code === 'Space' && !isInputFocused()) {
    e.preventDefault();
    if (isRecording) stopRecording();
  }
}
function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
onMount(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
});
```

**Test:** Click neutral area → hold Space → say "run it" → release → terminal executes. Also verify typing in input box still works.

---

## Protected Files (do NOT modify)
- start-atom-code.sh
- voice-server/ (entire directory)
- vite.config.js
- src/lib/api.js
- scripts/search-proxy.mjs

## Key Files for Voice
- src/lib/components/ChatInput.svelte — voice recording, transcription, command interception
- src/lib/components/PresetSelect.svelte — sets activePresetName on preset change
- src/lib/components/MessageBubble.svelte — lastCodeBlock tracking
- src/lib/stores.js — activePresetName + lastCodeBlock stores
- voice-server/app.py — faster-whisper server (DO NOT MODIFY)

## Git Tags / Restore Points
- stable-pre-phase12 — before any Phase 12 work
- stable-phase12a — voice commands first working
- stable-phase12a-presetfix — Phase 12A complete with preset gating ← LATEST STABLE

## Restart Everything
```bash
cd ~/atom-code && ./cleanup.sh && sleep 2 && ./start-atom-code.sh
```

## Nuclear Reset
```bash
cd ~/atom-code
git reset --hard stable-phase12a-presetfix
git push origin main --force
./cleanup.sh && sleep 2 && ./start-atom-code.sh
```

## Known Issues
- context_manager/__pycache__/ committed to git (harmless, add to .gitignore later)
- Terminal may have garbage from previous sessions — click Clear button
- Cursor reverts changes — always verify with grep after any Cursor session
