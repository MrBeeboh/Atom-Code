# ATOM Code — Project Status Report

**Purpose:** Get the team back in sync. One-page overview of what we have, what’s done lately, and what’s next.

**Last updated:** February 2025

---

## What This Project Is

**ATOM Code** is a **voice-first local coding assistant**. No cloud APIs, no subscriptions; everything runs on your machine with **LM Studio** as the AI backend. Target use: “vibe coding” — describe what you want, the AI writes code, you review diffs and approve.

- **Frontend:** Svelte 5, Vite, Tailwind CSS 4, xterm.js  
- **AI:** LM Studio (OpenAI-compatible API, `http://localhost:1234`)  
- **Storage:** Dexie.js (IndexedDB, browser-local)  
- **Optional services:** Terminal server (node-pty, port 8767), File server (Express, 8768), Voice server (Python + faster-whisper, 8765)

---

## Current Feature State

| Area | Status | Notes |
|------|--------|--------|
| Chat + streaming | ✅ Done | LM Studio `/v1/chat/completions`, streaming, usage stats |
| Model switching | ✅ Done | List/load/unload via LM Studio API; eject-before-load on preset change |
| Context trimming | ✅ Done | Uses real context window (settings → contextUsage → default 8192), not hardcoded 100k; debug log `[context] contextMax: ...` |
| Pinned files | ✅ Done | File tree pinning; pins kept on fetch failure |
| Code blocks | ✅ Done | Copy, Run (terminal), Save, Apply (diff → write to disk) |
| Diff viewer | ✅ Done | Apply/reject edits from AI |
| Quick actions / presets | ✅ Done | Explain, Fix, Refactor, Test, Document; Code/Debug/Review/etc. |
| Code editor panel | ✅ Done | CodeMirror, bottom panel, open from chat or explorer |
| Voice input | ✅ Done | faster-whisper (voice-server), optional |
| Error feedback loop | ✅ Done | Terminal error detection, “fix it” banner, send to model |
| Web search | ✅ Done | DuckDuckGo, optional |
| **Context manager (summarization + RAG)** | 📦 Standalone | Python in `context_manager/` — LM Studio summarizer, optional Chroma RAG; **not yet wired into the Svelte app** |
| CONTRIBUTING.md | ❌ Missing | Roadmap says add “how to run, test, where to look” |
| LICENSE | ❌ Missing | README says MIT; no LICENSE file in repo root |
| Connection status UI | ❌ Missing | Single line/icon for LM Studio + file server + optional terminal (recommended in roadmap) |

---

## Recent Changes (What Might Have Caused Drift)

1. **Context trimming (ChatView.svelte)**  
   Replaced hardcoded `contextMax = 100000` with: user `context_length` (settings) → `contextUsage.contextMax` → default **8192**. Trimming can now actually trigger for 4k–32k models. Debug: `console.log('[context] contextMax:', ...)`.

2. **Docs and context manager**  
   - LM Studio alignment and developer reference added: `docs/LM_STUDIO_ALIGNMENT.md`, `docs/LM_STUDIO_DEVELOPER_REFERENCE.md`.  
   - `context_manager/`: Vibe Coder dynamic summarization + optional Chroma RAG; uses LM Studio (e.g. gemma-3-4b-it) for summarization, trigger: turns ≥ 7 OR old tokens > 1500. Ready to integrate (see `context_manager/README.md`).

3. **Voice**  
   faster-whisper; startup script installs deps before uvicorn. See `VOICE-SETUP.md`, `voice-server/README.md`.

4. **Git**  
   Some UI files were reverted to last commit (`api.js`, `ChatView.svelte`, `PresetSelect.svelte`); then only `ChatView.svelte` was changed again for context trimming and committed with the rest of the repo (context_manager, docs, scripts).

---

## How to Run (Quick Reference)

- **Chat only (no terminal/files/voice):**  
  `npm install && npm run dev` → http://localhost:5173 (LM Studio must be running with a model loaded).

- **Full stack:**  
  `./start-atom-code.sh` (starts terminal server, file server, optional voice, optional LM Studio headless).  
  One-time: `npm run install:all` (or install terminal-server + file-server deps manually).

- **LM Studio check:**  
  `node scripts/check-lmstudio.mjs` (optional: `LM_STUDIO_BASE_URL`, `LM_API_TOKEN`).

- **Context manager (standalone):**  
  `cd context_manager && pip install -r requirements.txt && python3 vibe_coder_context_manager.py` (or `usage_example.py`).

---

## Repo Layout (Where to Look)

| Path | Purpose |
|------|--------|
| `src/lib/components/ChatView.svelte` | Main chat UI, context trim, send flow |
| `src/lib/api.js` | LM Studio (and cloud) API: list/load/unload, chat, stream |
| `src/lib/stores.js` | settings, contextUsage, conversations, etc. |
| `services/terminal-server` | xterm/pty WebSocket server |
| `services/file-server` | Project file read/write API |
| `voice-server/` | faster-whisper STT (FastAPI) |
| `context_manager/` | Python summarization + optional RAG (not in frontend yet) |
| `docs/` | LM Studio alignment, developer reference, roadmap, this status report |

---

## Suggested Next Steps (To Re-sync)

1. **Everyone:** Pull latest, run `npm install` (and `./start-atom-code.sh` if you use full stack). Confirm LM Studio is on 1234 and a model is loaded; try a chat and check browser console for `[context] contextMax: ...`.
2. **Docs/legal:** Add `LICENSE` (e.g. MIT) and `CONTRIBUTING.md` (run, test, where to look) so the roadmap and README match reality.
3. **Product/UX:** Decide whether to add a single “connection status” line (LM Studio + file server + optional terminal) and/or optional “project context” in Settings.
4. **Integration:** If we want long-chat compression in the app, wire `context_manager` into the Svelte frontend (e.g. subprocess or small REST wrapper); see `context_manager/README.md` for options.

---

## Key Docs

- **README.md** — What it is, quick start, roadmap.  
- **docs/LM_STUDIO_ALIGNMENT.md** — How we use LM Studio (URLs, list/load/unload, chat, eject).  
- **docs/LM_STUDIO_DEVELOPER_REFERENCE.md** — API details, JIT/TTL, eject rules.  
- **docs/VIBE_CODING_ROADMAP.md** — Prioritized improvements, in/out of scope.  
- **context_manager/README.md** — Summarization + RAG, how to run and integrate.  
- **VOICE-SETUP.md** / **voice-server/README.md** — Voice stack and setup.

Share this file with the team and use it as the single “where we are” reference until the next update.
