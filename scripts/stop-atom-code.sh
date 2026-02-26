#!/bin/bash
# ── ATOM Code — Stop all services cleanly ──

ATOM_DIR="$HOME/atom-code"

echo "Stopping ATOM Code..."

# Kill watchdog first so it cannot restart services as we stop them
if [ -f "$ATOM_DIR/watchdog.pid" ]; then
  WPID=$(cat "$ATOM_DIR/watchdog.pid")
  kill "$WPID" 2>/dev/null
  rm "$ATOM_DIR/watchdog.pid"
  echo "  Watchdog stopped (PID: $WPID)"
fi

sleep 1

# Stop all services
pkill -f "uvicorn.*app:app.*8765" 2>/dev/null && echo "  Voice server stopped"
pkill -f "node.*file-server/server.js" 2>/dev/null && echo "  File server stopped"
pkill -f "node.*terminal-server/server.js" 2>/dev/null && echo "  Terminal server stopped"
pkill -f "node.*search-proxy.mjs" 2>/dev/null && echo "  Search proxy stopped"
pkill -f "vite" 2>/dev/null && echo "  UI stopped"

# LM Studio — stop gracefully if lms CLI is available
if command -v lms &>/dev/null; then
  lms server stop 2>/dev/null && echo "  LM Studio stopped"
elif [ -x "${LMSTUDIO_CLI_PATH:-$HOME/.lmstudio/bin/lms}" ]; then
  "${LMSTUDIO_CLI_PATH:-$HOME/.lmstudio/bin/lms}" server stop 2>/dev/null && echo "  LM Studio stopped"
fi

echo ""
echo "All ATOM Code services stopped."
