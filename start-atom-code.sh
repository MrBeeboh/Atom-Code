#!/bin/bash
cd "$(dirname "$0")"

echo "Starting ATOM Code..."

# Terminal server
(cd services/terminal-server && node server.js) &
TERM_PID=$!

# File server
(cd services/file-server && node server.js) &
FILE_PID=$!

# Voice server (optional)
if [ -f voice-server/app.py ]; then
  (cd voice-server && python3 -m uvicorn app:app --host 0.0.0.0 --port 8765 2>/dev/null) &
  VOICE_PID=$!
fi

# Dev server
npm run dev -- --open &
DEV_PID=$!

echo ""
echo "  ATOM Code:  http://localhost:5173"
echo "  Terminal:   ws://localhost:8767"
echo "  File:       http://localhost:8768"
echo "  Voice:      http://localhost:8765"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $TERM_PID $FILE_PID $VOICE_PID $DEV_PID 2>/dev/null; exit" INT TERM
wait
