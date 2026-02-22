import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.FILE_PORT || '8768', 10);

// GET /tree?root=/path/to/project&depth=3
app.get('/tree', async (req, res) => {
  const root = req.query.root || process.env.HOME;
  const maxDepth = parseInt(req.query.depth || '3', 10);

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
  const normalized = path.normalize(raw.trim());
  if (!path.isAbsolute(normalized)) {
    console.log('[file-server] /content: path not absolute:', normalized);
    return res.status(400).json({ error: 'path must be absolute' });
  }
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
  try {
    await fs.writeFile(req.body.path, req.body.content, 'utf-8');
    res.json({ ok: true, path: req.body.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`File server on http://localhost:${PORT}`));
