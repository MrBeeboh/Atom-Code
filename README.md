# ATOM Code

A voice-first local coding assistant. No cloud APIs, no subscriptions, no sending your code to anyone. Runs entirely on your machine with LM Studio.

## What It Does

- **Voice-first chat** — Talk to your AI model using local Whisper speech-to-text. No audio leaves your machine.
- **Integrated terminal** — Real bash shell in the browser via xterm.js and node-pty. Run code directly from chat.
- **File explorer** — Browse your project, pin files as context for the AI model. **Pinned files** are set in the file tree (right-click a file → “Pin as context”); they show a pin icon and “Unpin all” in the explorer. The sidebar **Pinned** list is for **pinned conversations** (chats), not files. Pinned files are never auto-removed when a fetch fails; they stay in the list until you unpin.
- **Code block actions** — Every code block has Copy, Run (sends to terminal), Save (downloads file), and Apply (diff viewer with before/after comparison and one-click write to disk).
- **Diff viewer** — See exactly what changes the AI wants to make to your files. Green for added, red for removed. Apply or reject.
- **Quick actions** — One-click Explain, Fix, Refactor, Test, Document buttons that pre-fill coding prompts.
- **Coding presets** — Switch between Code, Debug, Review, Refactor, Explain, and General system prompts.
- **Model switching** — Use any model loaded in LM Studio. Switch models mid-conversation.
- **Performance stats** — Live tokens/sec, token count, and latency on every response.
- **Context usage indicator** — Visual ring showing how much of the model's context window you're using.
- **100% local** — Everything runs on your hardware. Voice processing, AI inference, file access, terminal — all local.

## Who It's For

People who want to build software by talking to an AI, not by typing code. ATOM Code is designed for voice-first "vibe coding" — describe what you want, the AI writes it, you review the diff and approve it.

## Architecture

- **Frontend:** Svelte 5, Vite, Tailwind CSS 4, xterm.js
- **Storage:** Dexie.js (IndexedDB, browser-local)
- **AI Backend:** LM Studio (OpenAI-compatible API, runs locally)
- **Terminal Server:** Node.js + node-pty (WebSocket on port 8767)
- **File Server:** Express.js (read/write project files, port 8768)
- **Voice Server:** Python + FastAPI + Whisper (local STT, port 8765)

## Quick Start

### Basic (chat only, no terminal/files/voice):
```bash
npm install
npm run dev
```
Open http://localhost:5173. Requires LM Studio running with a model loaded.

### Full Stack (all features):
```bash
# Install dependencies
npm install
cd services/terminal-server && npm install && cd ../..
cd services/file-server && npm install && cd ../..
cd voice-server && pip install -r requirements.txt && cd ..

# Start everything
chmod +x start-atom-code.sh
./start-atom-code.sh
```

### Requirements
- Node.js 18+
- Python 3.10+ (for voice only)
- build-essential (for node-pty compilation)
- LM Studio running locally
- Linux (tested on Linux Mint)

## Roadmap

- [x] Chat with local AI models
- [x] Voice input (local Whisper)
- [x] Integrated terminal
- [x] File explorer with pinning
- [x] Code block actions (copy, run, save, apply)
- [x] Diff viewer with apply-to-file
- [x] Quick actions and coding presets
- [ ] Error feedback loop (auto-detect terminal errors, one-click fix)
- [ ] Codebase-aware context (auto-index project files)
- [ ] Code editor panel
- [ ] Voice commands ("fix it", "run it", "apply it")
- [ ] Vision integration (screenshot-to-fix)

## License

MIT
