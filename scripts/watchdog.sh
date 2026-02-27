#!/bin/bash
# ── ATOM Code Watchdog — monitors and auto-restarts all 6 services ──

ATOM_DIR="$HOME/atom-code"
LOG_FILE="$ATOM_DIR/watchdog.log"
CHECK_INTERVAL=30

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ── Health checks ──────────────────────────────────────
check_lm_studio()     { curl -sf http://localhost:1234/v1/models > /dev/null 2>&1; }
check_voice()         { curl -sf http://localhost:8765/health > /dev/null 2>&1; }
check_voice_tts()     { curl -sf http://localhost:8765/tts/voices > /dev/null 2>&1; }
check_file_server()   { curl -sf http://localhost:8768/tree > /dev/null 2>&1; }
check_terminal()      { curl -sf http://localhost:8767 > /dev/null 2>&1; }
check_search_proxy()  { curl -sf http://localhost:5174/api/health > /dev/null 2>&1; }
check_ui()            { curl -sf http://localhost:5173 > /dev/null 2>&1; }

# ── Restart functions (exact commands from start-atom-code.sh) ──

restart_lm_studio() {
  log "LM Studio not responding — restarting"
  LMSPATH="${LMSTUDIO_CLI_PATH:-$HOME/.lmstudio/bin/lms}"
  if command -v lms &>/dev/null; then
    lms server start --cors >> "$LOG_FILE" 2>&1 &
  elif [ -x "$LMSPATH" ]; then
    "$LMSPATH" server start --cors >> "$LOG_FILE" 2>&1 &
  else
    log "WARNING: LM Studio CLI not found — cannot restart"
    return
  fi
  sleep 3
  check_lm_studio && log "LM Studio restored" || log "WARNING: LM Studio still down"
}

restart_voice() {
  log "Voice server not responding — restarting"
  pkill -f "uvicorn.*app:app.*8765" 2>/dev/null
  sleep 1
  if [ -f "$ATOM_DIR/voice-server/app.py" ]; then
    if [ -x "$ATOM_DIR/voice-server/venv/bin/python3" ]; then
      cd "$ATOM_DIR/voice-server" && \
        nohup ./venv/bin/python3 -m uvicorn app:app \
          --host 0.0.0.0 --port 8765 \
          >> "$ATOM_DIR/voice-server.log" 2>&1 &
      disown
    else
      cd "$ATOM_DIR/voice-server" && \
        nohup python3 -m uvicorn app:app \
          --host 0.0.0.0 --port 8765 \
          >> "$ATOM_DIR/voice-server.log" 2>&1 &
      disown
    fi
    sleep 3
    check_voice && log "Voice server restored" || log "WARNING: Voice server still down"
  else
    log "WARNING: voice-server/app.py not found — skipping"
  fi
}

restart_file_server() {
  log "File server not responding — restarting"
  pkill -f "node.*file-server/server.js" 2>/dev/null
  sleep 1
  cd "$ATOM_DIR/services/file-server" && \
    nohup node server.js >> "$ATOM_DIR/file-server.log" 2>&1 &
  disown
  sleep 3
  check_file_server && log "File server restored" || log "WARNING: File server still down"
}

restart_terminal() {
  log "Terminal server not responding — restarting"
  pkill -f "node.*terminal-server/server.js" 2>/dev/null
  sleep 1
  cd "$ATOM_DIR/services/terminal-server" && \
    nohup node server.js >> "$ATOM_DIR/terminal-server.log" 2>&1 &
  disown
  sleep 3
  check_terminal && log "Terminal server restored" || log "WARNING: Terminal server still down"
}

restart_search_proxy() {
  log "Search proxy not responding — restarting"
  pkill -f "node.*search-proxy.mjs" 2>/dev/null
  sleep 1
  if [ -f "$ATOM_DIR/scripts/search-proxy.mjs" ]; then
    cd "$ATOM_DIR" && \
      nohup node scripts/search-proxy.mjs >> "$ATOM_DIR/search-proxy.log" 2>&1 &
    disown
    sleep 3
    check_search_proxy && log "Search proxy restored" || log "WARNING: Search proxy still down"
  else
    log "WARNING: scripts/search-proxy.mjs not found — skipping"
  fi
}

restart_ui() {
  log "Vite UI not responding — restarting"
  pkill -f "vite" 2>/dev/null
  sleep 1
  cd "$ATOM_DIR" && \
    nohup npm run dev >> "$ATOM_DIR/ui.log" 2>&1 &
  disown
  sleep 5
  check_ui && log "UI restored" || log "WARNING: UI still starting up"
}

# ── Main loop ──────────────────────────────────────────
log "=== ATOM Code Watchdog started — monitoring 6 services ==="
log "    Check interval: ${CHECK_INTERVAL}s"

while true; do
  check_lm_studio    || restart_lm_studio
  check_voice        || restart_voice
  check_voice_tts    || restart_voice
  check_file_server  || restart_file_server
  check_terminal     || restart_terminal
  check_search_proxy || restart_search_proxy
  check_ui           || restart_ui
  sleep "$CHECK_INTERVAL"
done
