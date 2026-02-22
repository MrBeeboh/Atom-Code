# ATOM Code

An open-source **vibe coding** assistant: chat with AI, pin files as context, run code in the integrated terminal, and apply edits back to your project. Connects to any OpenAI-compatible API (e.g. [LM Studio](https://lmstudio.ai/)) — no backend required for basic chat.

## Features

- **Chat** with streaming responses and code-aware rendering
- **Code blocks** with copy, run-in-terminal, and save-to-file actions
- **Integrated terminal** panel (Ctrl+`) for running commands
- **File explorer** with workspace browsing and pinned context files
- **Voice input** via Whisper STT
- **Quick actions** toolbar: Explain, Fix, Refactor, Test, Document
- **Coding presets**: Code, Debug, Review, Refactor, Explain
- **Model switching** — supports LM Studio local models + DeepSeek/Grok cloud APIs
- **Performance stats** (tokens/sec, latency)
- **Multiple themes** including dark/light/neural/signal

## Quick Start

```bash
# Basic (chat only, no terminal/file features)
npm install
npm run dev

# Full stack (terminal + file explorer + voice)
chmod +x start-atom-code.sh
./start-atom-code.sh
```

Open http://localhost:5173

## Requirements

- Node.js 18+
- A model server (e.g. LM Studio) with at least one model loaded
- For terminal: `node-pty` build tools (`sudo apt install build-essential python3`)
- For voice: Python 3.10+ with PyTorch and Transformers

## Tech

- Svelte 5 + Vite + Tailwind CSS 4
- Dexie.js for IndexedDB storage
- xterm.js for integrated terminal
- marked + highlight.js for code rendering
- Whisper for voice-to-text
