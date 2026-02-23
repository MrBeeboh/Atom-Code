# ATOM Code — Vibe Coding Roadmap

Solid additions to make the app more polished and professional for open-source vibe coding. No bloat.

---

## Already strong

- Chat + streaming, code blocks (copy / run in terminal / save to file)
- File explorer + pinned context, integrated terminal, voice input (faster-whisper), web search
- Code editor panel (bottom panel; open from chat or file explorer)
- Quick actions (Explain, Fix, Refactor, Test, Document), presets, diff/apply to file
- Command palette, export chat, keyboard shortcuts, multiple themes

---

## High value (recommended)

| Area | What | Why |
|------|------|-----|
| **Docs** | README: one-line “vibe coding” + “ATOM Code is a …” | Clear positioning for GitHub/community. |
| **Docs** | `CONTRIBUTING.md` (how to run, test, where to look) | Makes OSS contribution obvious. |
| **Legal** | `LICENSE` (e.g. MIT) in repo root | Standard for open source. |
| **Discoverability** | Shortcuts modal lists **all** main shortcuts (Ctrl+E, Ctrl+`, etc.) | Users find features without guessing. |
| **Status** | Single “connection status” line or icon (LM Studio + file server + optional terminal) | “Why isn’t it working?” answered in one place. |
| **Context** | Optional one-line “project context” in Settings (e.g. “Svelte 5 + Vite app”) | Keeps model focused on stack without extra UI. |

---

## Nice to have (still lean)

- **Apply from block**: “Apply” on a code block that writes *only* that block to a path (no full diff). Faster than “open diff → apply” for single snippets.
- **First-run tip**: One dismissible line under the input, e.g. “Pin files in the explorer (Ctrl+E) to add them to context.”
- **About / version**: In Settings or footer: “ATOM Code v0.x” + link to repo.

---

## Explicitly out of scope (no bloat)

- No extra panels beyond chat, terminal, file explorer, intel/settings.
- No built-in auth or user accounts.
- No plugin/marketplace system.
- No second sidebar or heavy “project dashboard.”

---

## Summary

**Do first:** README positioning, LICENSE, shortcuts list complete, optional status line.  
**Then:** CONTRIBUTING, optional project-context line, optional “apply this block” action.  
**Skip:** Anything that doesn’t directly improve the “chat + context + terminal + apply” vibe coding loop.
