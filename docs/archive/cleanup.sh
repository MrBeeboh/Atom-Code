#!/bin/bash
# ATOM Code — Kill all services and clear ports
# Run this if start-atom-code.sh fails with EADDRINUSE errors

pkill -f "node server.js" 2>/dev/null
pkill -f "uvicorn" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "search-proxy" 2>/dev/null
sudo lsof -ti :5173 | xargs kill -9 2>/dev/null
sudo lsof -ti :8765 | xargs kill -9 2>/dev/null
sudo lsof -ti :8767 | xargs kill -9 2>/dev/null
sudo lsof -ti :8768 | xargs kill -9 2>/dev/null
echo "All Atom-Code services cleared. Run ./start-atom-code.sh to restart."
