import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import os from 'os';

const PORT = parseInt(process.env.TERMINAL_PORT || '8767', 10);
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
console.log(`Terminal server listening on ws://127.0.0.1:${PORT}`);

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
    } catch (_) {}
    ptyProcess.write(str);
  });

  ws.on('close', () => ptyProcess.kill());
  ptyProcess.onExit(() => ws.close());
});
