#!/bin/bash
cd "$(dirname "$0")"

# Clean up any previously lingering orphaned processes before starting
pkill -f "node.*terminal-server/server.js" 2>/dev/null
pkill -f "node.*file-server/server.js" 2>/dev/null
pkill -f "node.*search-proxy.mjs" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "uvicorn.*app:app.*8765" 2>/dev/null
[ -f "$HOME/atom-code/watchdog.pid" ] && kill -9 $(cat "$HOME/atom-code/watchdog.pid") 2>/dev/null && rm -f "$HOME/atom-code/watchdog.pid"

echo "Starting ATOM Code..."

export ATOM_WORKSPACE_ROOT="${ATOM_WORKSPACE_ROOT:-$HOME}"

# LM Studio headless server (OpenAI-compatible API / WebSocket SDK on port 1234)
LMSPATH="${LMSTUDIO_CLI_PATH:-$HOME/.lmstudio/bin/lms}"
LLMSTERPATH="${LLMSTER_CLI_PATH:-$HOME/.lmstudio/bin/llmster}"
if command -v lms &>/dev/null; then
  (lms server start --cors 2>/dev/null) &
  LMS_PID=$!
  echo "  LM Studio:  starting headless daemon (ws://localhost:1234)"
elif [ -x "$LMSPATH" ]; then
  ("$LMSPATH" server start --cors 2>/dev/null) &
  LMS_PID=$!
  echo "  LM Studio:  starting headless daemon (ws://localhost:1234)"
elif command -v llmster &>/dev/null; then
  (llmster serve --cors 2>/dev/null || llmster --cors 2>/dev/null) &
  LMS_PID=$!
  echo "  LM Studio:  starting llmster headless daemon (ws://localhost:1234)"
elif [ -x "$LLMSTERPATH" ]; then
  ("$LLMSTERPATH" serve --cors 2>/dev/null || "$LLMSTERPATH" --cors 2>/dev/null) &
  LMS_PID=$!
  echo "  LM Studio:  starting llmster headless daemon (ws://localhost:1234)"
else
  LMS_PID=""
  echo "  LM Studio:  not found (install llmster/lms from https://lmstudio.ai); app will use Cloud or prompt to start LM Studio GUI"
fi

# Terminal server
(cd services/terminal-server && exec node server.js) &
TERM_PID=$!

# File server
(cd services/file-server && exec node server.js) &
FILE_PID=$!

# Search proxy (Brave /api/search, /api/health, /api/set-key on 5174)
if [ -f scripts/search-proxy.mjs ]; then
  (exec node scripts/search-proxy.mjs) &
  SEARCH_PID=$!
else
  SEARCH_PID=""
fi

# Voice server (optional) — faster-whisper; venv must have deps from voice-server/requirements.txt
if [ -f voice-server/app.py ]; then
  if [ -x voice-server/venv/bin/python3 ]; then
    (cd voice-server && ./venv/bin/python3 -m pip install -r requirements.txt -q 2>/dev/null)
    (cd voice-server && exec ./venv/bin/python3 -m uvicorn app:app --host 0.0.0.0 --port 8765) &
    VOICE_PID=$!
    echo "  Voice:      starting (http://localhost:8765)"
  else
    (cd voice-server && exec python3 -m uvicorn app:app --host 0.0.0.0 --port 8765) &
    VOICE_PID=$!
    echo "  Voice:      starting (http://localhost:8765, no venv)"
  fi
fi

# Dev server
(exec npm run dev -- --open) &
DEV_PID=$!

echo ""
echo "  ATOM Code:  http://localhost:5173"
echo "  Terminal:   ws://localhost:8767"
echo "  File:       http://localhost:8768"
echo "  Voice:      http://localhost:8765"
echo "  Search:     http://localhost:5174"
echo ""

# Launch watchdog
echo "Starting watchdog monitor..."
nohup "$HOME/atom-code/scripts/watchdog.sh" >> "$HOME/atom-code/watchdog.log" 2>&1 &
WATCHDOG_PID=$!
disown $WATCHDOG_PID
echo $WATCHDOG_PID > "$HOME/atom-code/watchdog.pid"
echo "  Watchdog:   started (PID: $WATCHDOG_PID)"
echo ""
echo "Press Ctrl+C to stop all services"

cleanup() {
  echo ""
  echo "Stopping ATOM Code..."
  # Kill watchdog first so it cannot restart services as we stop them
  [ -f "$HOME/atom-code/watchdog.pid" ] && kill -9 $(cat "$HOME/atom-code/watchdog.pid") 2>/dev/null && rm -f "$HOME/atom-code/watchdog.pid"
  
  # Robustly kill all spawned process groups to prevent port-holding orphans
  pkill -f "node.*terminal-server/server.js" 2>/dev/null
  pkill -f "node.*file-server/server.js" 2>/dev/null
  pkill -f "node.*search-proxy.mjs" 2>/dev/null
  pkill -f "vite" 2>/dev/null
  pkill -f "uvicorn.*app:app.*8765" 2>/dev/null
  
  kill $TERM_PID $FILE_PID $SEARCH_PID $VOICE_PID $DEV_PID $LMS_PID 2>/dev/null
  echo "All services stopped."
  exit
}

trap cleanup INT TERM
wait
