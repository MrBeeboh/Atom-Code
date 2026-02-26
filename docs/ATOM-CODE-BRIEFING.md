# ATOM Code — AI Agent Briefing

Read this entire document before making any changes to this codebase.

## What This Project Is

ATOM Code is a local AI coding assistant. It is a Svelte 5 frontend that connects to LM Studio for local LLM inference. It has six backend services. It is NOT a simple chat app — it has codebase indexing, auto-context injection, voice input, terminal integration, and git tooling.

## Critical Rules

1. Never modify ~/atom-chat — that is a separate project
2. Never change port numbers without updating ALL references across ALL service files and the watchdog
3. Never remove the `repoMapSignatures` store — it is the backbone of the auto-context system
4. Never apply breaking changes to `buildRepoMapText` or `findRelevantFiles` without verifying auto-context injection still works
5. Always commit each phase separately — do not bundle unrelated changes into one commit
6. Test the app loads at localhost:5173 after every commit before proceeding

## Architecture — Six Services

| Service | Port | Entry Point | Start Command |
|---|---|---|---|
| Vite UI | 5173 | index.html | `npm run dev` |
| LM Studio | 1234 | external app | `lms server start` |
| File Server | 8768 | services/file-server/server.js | `node server.js` |
| Terminal Server | 8767 | services/terminal-server/server.js | `node server.js` |
| Search Proxy | 5174 | scripts/search-proxy.mjs | `node scripts/search-proxy.mjs` |
| Voice Server | 8765 | voice-server/app.py | `uvicorn app:app --host 0.0.0.0 --port 8765` |

## Key Files — Read These First

- `src/lib/repoMap.js` — codebase indexing and findRelevantFiles auto-context logic
- `src/lib/components/ChatView.svelte` — message pipeline, API calls, context injection
- `src/lib/components/CommandCenter.svelte` — top bar, workspace selector, refresh context button
- `services/file-server/server.js` — /tree and /repomap endpoints
- `scripts/start-atom-code.sh` — startup sequence for all services (Note: lives at repo root as `start-atom-code.sh`)
- `scripts/watchdog.sh` — auto-restart monitor for all 6 services
- `scripts/stop-atom-code.sh` — clean shutdown script

## Current Phase Status

- Phase 1 — Input bar redesign: COMPLETE
- Phase 2 — Repo map indexing: COMPLETE
- Phase 3 — Signature-aware auto-context injection: COMPLETE
- Phase 4 — Glassmorphism UI polish: COMPLETE
- Phase 5 — Watchdog auto-restart service: COMPLETE
- Phase 6 — Repo cleanup and documentation: COMPLETE

## Known Working Models

Tested and performing well on RTX 4070:
- Qwen3-Coder-30B-A3B-Instruct
- QWEN/QWEN2.5-CODER-14B

## Theme System

Themes are defined as CSS custom property blocks in `src/app.css` with `[data-ui-theme="name"]` selectors. Theme metadata lives in `src/lib/themeOptions.js`. Auto/Light/Dark mode toggling is handled in `App.svelte` via the `applyResolvedTheme` function.

Available themes: light, dark, coder, ollama, perplexity, trek (LCARS)
