import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const PORT = parseInt(process.env.FILE_PORT || '8768', 10);
const WORKSPACE_ROOT = path.resolve(process.env.ATOM_WORKSPACE_ROOT || process.env.HOME || '/');
const BLOCKED_PATHS = [
  '/.ssh/', '/.gnupg/', '/.bashrc', '/.bash_profile',
  '/.profile', '/.env', '/etc/', '/.config/git',
  '/.gitconfig', '/.npmrc',
];

function checkPathAccess(normalized, res) {
  if (!path.isAbsolute(normalized)) return false;
  const normalizedRoot = path.resolve(WORKSPACE_ROOT);
  for (const blocked of BLOCKED_PATHS) {
    if (normalized.includes(blocked)) {
      res.status(403).json({ error: 'Access denied: protected path' });
      return false;
    }
  }
  if (!normalized.startsWith(normalizedRoot)) {
    res.status(403).json({ error: 'Access denied: path is outside workspace root' });
    return false;
  }
  return true;
}

// GET /tree?root=/path/to/project&depth=3
app.get('/tree', async (req, res) => {
  const rawRoot = req.query.root || process.env.HOME || WORKSPACE_ROOT;
  const root = path.resolve(String(rawRoot).trim());
  const maxDepth = parseInt(req.query.depth || '3', 10);

  if (!checkPathAccess(root, res)) return;

  async function walk(dir, depth = 0) {
    if (depth >= maxDepth) return [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push({ name: entry.name, path: fullPath, type: 'dir', children: await walk(fullPath, depth + 1) });
        } else {
          results.push({ name: entry.name, path: fullPath, type: 'file' });
        }
      }
      return results.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    } catch {
      return [];
    }
  }

  res.json(await walk(root));
});

// GET /content?path=/path/to/file.py  (path must be absolute)
app.get('/content', async (req, res) => {
  const raw = req.query.path;
  if (typeof raw !== 'string' || !raw.trim()) {
    console.log('[file-server] /content: missing or empty path');
    return res.status(400).json({ error: 'path query required' });
  }
  const normalized = path.resolve(path.normalize(raw.trim()));
  if (!path.isAbsolute(normalized)) {
    console.log('[file-server] /content: path not absolute:', normalized);
    return res.status(400).json({ error: 'path must be absolute' });
  }
  if (!checkPathAccess(normalized, res)) return;
  try {
    const content = await fs.readFile(normalized, 'utf-8');
    console.log('[file-server] /content OK:', normalized);
    res.json({ content, path: normalized });
  } catch (err) {
    console.log('[file-server] /content ERROR:', err.code || 'unknown', normalized, err.message);
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    if (err.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    res.status(404).json({ error: err.message });
  }
});

// POST /write { path, content }
app.post('/write', async (req, res) => {
  const raw = req.body?.path;
  if (typeof raw !== 'string' || !raw.trim()) {
    return res.status(400).json({ error: 'path required' });
  }
  const normalized = path.resolve(path.normalize(raw.trim()));
  if (!path.isAbsolute(normalized)) {
    return res.status(400).json({ error: 'path must be absolute' });
  }
  if (!checkPathAccess(normalized, res)) return;
  try {
    await fs.writeFile(normalized, req.body.content ?? '', 'utf-8');
    res.json({ ok: true, path: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`File server on http://localhost:${PORT}`));
