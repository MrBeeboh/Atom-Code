#!/bin/bash
cd "$(dirname "$0")"

echo "Starting ATOM Code..."

export ATOM_WORKSPACE_ROOT="${ATOM_WORKSPACE_ROOT:-$HOME}"

# LM Studio headless server (OpenAI-compatible API on port 1234)
LMSPATH="${LMSTUDIO_CLI_PATH:-$HOME/.lmstudio/bin/lms}"
if command -v lms &>/dev/null; then
  (lms server start 2>/dev/null) &
  LMS_PID=$!
  echo "  LM Studio:  starting headless (http://localhost:1234)"
elif [ -x "$LMSPATH" ]; then
  ("$LMSPATH" server start 2>/dev/null) &
  LMS_PID=$!
  echo "  LM Studio:  starting headless (http://localhost:1234)"
else
  LMS_PID=""
  echo "  LM Studio:  not found (install from https://lmstudio.ai or set LMSTUDIO_CLI_PATH); app will use Cloud or prompt to start LM Studio"
fi

# Terminal server
(cd services/terminal-server && node server.js) &
TERM_PID=$!

# File server
(cd services/file-server && node server.js) &
FILE_PID=$!

# Search proxy (Brave /api/search, /api/health, /api/set-key on 5174)
if [ -f scripts/search-proxy.mjs ]; then
  (node scripts/search-proxy.mjs) &
  SEARCH_PID=$!
else
  SEARCH_PID=""
fi

# Voice server (optional) — use venv Python so uvicorn/whisper deps are found
if [ -f voice-server/app.py ]; then
  if [ -x voice-server/venv/bin/python3 ]; then
    (cd voice-server && ./venv/bin/python3 -m uvicorn app:app --host 0.0.0.0 --port 8765) &
    VOICE_PID=$!
    echo "  Voice:      starting (http://localhost:8765)"
  else
    (cd voice-server && python3 -m uvicorn app:app --host 0.0.0.0 --port 8765) &
    VOICE_PID=$!
    echo "  Voice:      starting (http://localhost:8765, no venv)"
  fi
fi

# Dev server
npm run dev -- --open &
DEV_PID=$!

echo ""
echo "  ATOM Code:  http://localhost:5173"
echo "  Terminal:   ws://localhost:8767"
echo "  File:       http://localhost:8768"
echo "  Voice:      http://localhost:8765"
echo "  Search:     http://localhost:5174"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $TERM_PID $FILE_PID $SEARCH_PID $VOICE_PID $DEV_PID $LMS_PID 2>/dev/null; exit" INT TERM
wait
