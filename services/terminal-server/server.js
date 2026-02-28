import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import os from 'os';
import http from 'http';

const PORT = parseInt(process.env.TERMINAL_PORT || '8767', 10);
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');

// Create an HTTP server that also handles WebSocket upgrades
const httpServer = http.createServer((req, res) => {
  // CORS headers: allow only local UI ports
  const origin = req.headers.origin || '';
  const allowed = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:4173', 'http://127.0.0.1:4173'
  ];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    console.log('Terminal server: shutdown requested via HTTP');
    shutdown('HTTP /shutdown');
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Terminal server listening on ws://127.0.0.1:${PORT}`);
});

wss.on('connection', (ws) => {
  const ptyProcess = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: process.env.HOME || process.cwd(),
    env: process.env,
  });

  ptyProcess.onData((data) => ws.send(data));

  ws.on('message', (msg) => {
    const str = msg.toString();
    // Handle resize messages
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === 'resize') {
        ptyProcess.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch (_) { }
    ptyProcess.write(str);
  });

  ws.on('close', () => ptyProcess.kill());
  ptyProcess.onExit(() => ws.close());
});

// ── Graceful shutdown ──────────────────────────────────
function shutdown(signal) {
  console.log(`\nTerminal server received ${signal}, shutting down...`);
  // Close all WebSocket connections and kill their pty processes
  wss.clients.forEach((client) => {
    try { client.close(); } catch (_) { }
  });
  wss.close(() => {
    httpServer.close(() => {
      console.log('Terminal server closed.');
      process.exit(0);
    });
  });
  // Force exit after 3s if something hangs
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
