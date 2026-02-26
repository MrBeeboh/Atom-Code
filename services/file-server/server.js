import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
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

// GET /repomap?path=/path/to/project
app.get('/repomap', async (req, res) => {
  const rawPath = req.query.path;
  if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
    return res.status(400).json({ error: 'invalid path' });
  }

  const root = path.resolve(rawPath.trim());

  try {
    const stats = await fs.stat(root);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'invalid path' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'invalid path' });
  }

  if (!checkPathAccess(root, res)) return;

  const EXCLUDED_DIRS = ['node_modules', 'dist', '.git', '.svelte-kit', '__pycache__', 'venv', 'env'];
  const EXCLUDED_FILES = ['package-lock.json', 'yarn.lock'];
  const EXCLUDED_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.webm', '.pdf', '.zip', '.tar', '.gz'];
  const CODE_EXTS = ['.js', '.mjs', '.ts', '.svelte', '.py'];

  let treeString = '';
  const signatures = {};
  let signatureBytes = 0;
  const MAX_SIGNATURE_BYTES = 100 * 1024; // 100KB

  async function buildMap(dir, prefix = '', isLast = true) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      const filtered = entries.filter(e => {
        if (e.name.startsWith('.')) return false;
        if (e.isDirectory() && EXCLUDED_DIRS.includes(e.name)) return false;
        if (e.isFile()) {
          if (EXCLUDED_FILES.includes(e.name)) return false;
          const ext = path.extname(e.name).toLowerCase();
          if (EXCLUDED_EXTS.includes(ext)) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i];
        const isEntryLast = i === filtered.length - 1;
        const entryPath = path.join(dir, entry.name);

        const branch = isEntryLast ? '└── ' : '├── ';
        treeString += `${prefix}${branch}${entry.name}\n`;

        if (entry.isDirectory()) {
          const nextPrefix = prefix + (isEntryLast ? '    ' : '│   ');
          await buildMap(entryPath, nextPrefix, isEntryLast);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTS.includes(ext)) {
            await extractSignatures(entryPath, ext);
          }
        }
      }
    } catch (err) {
      // ignore
    }
  }

  async function extractSignatures(filePath, ext) {
    if (signatureBytes >= MAX_SIGNATURE_BYTES) return;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const fileSigs = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let sig = null;
        let originalLine = line;

        if (['.js', '.mjs', '.ts', '.svelte'].includes(ext)) {
          if (line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/)) {
            sig = line.replace(/\s*\{.*$/, '').trim();
          } else if (line.match(/^(?:export\s+)?const\s+[A-Za-z0-9_]+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/)) {
            sig = line.replace(/\s*\{.*$/, '').trim();
          } else if (line.match(/^(?:export\s+)?(?:default\s+)?class\s+[A-Za-z0-9_]+/)) {
            sig = line.replace(/\s*\{.*$/, '').trim();
          }
        } else if (ext === '.py') {
          if (line.match(/^(?:async\s+)?(?:def|class)\s+[A-Za-z0-9_]+/)) {
            sig = line.replace(/\s*:.*$/, '').trim() + ':';
          }
        }

        if (sig) {
          let fullSig = sig;

          if (['.js', '.mjs', '.ts', '.svelte'].includes(ext)) {
            if (i > 0) {
              for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                if (lines[j].trim().endsWith('*/')) {
                  for (let k = j; k >= Math.max(0, j - 10); k--) {
                    if (lines[k].trim().startsWith('/**')) {
                      const doc = lines.slice(k, j + 1).map(l => l.trim()).join('\n');
                      fullSig = doc + '\n' + sig;
                      break;
                    }
                  }
                  break;
                }
                if (lines[j].trim() !== '') break;
              }
            }
          } else if (ext === '.py') {
            if (i + 1 < lines.length && lines[i + 1].trim().startsWith('\"\"\"')) {
              let docEnd = i + 1;
              if (!lines[i + 1].trim().endsWith('\"\"\"') || lines[i + 1].trim() === '\"\"\"') {
                for (let j = i + 2; j < Math.min(lines.length, i + 10); j++) {
                  if (lines[j].trim().endsWith('\"\"\"')) {
                    docEnd = j;
                    break;
                  }
                }
              }
              const doc = lines.slice(i + 1, docEnd + 1).map(l => l.trim()).join('\n');
              fullSig = sig + '\n' + doc;
            }
          }

          fileSigs.push(fullSig);
          signatureBytes += Buffer.byteLength(fullSig, 'utf8');
        }

        if (signatureBytes >= MAX_SIGNATURE_BYTES) break;
      }

      if (fileSigs.length > 0) {
        const relPath = path.relative(root, filePath);
        signatures[relPath] = fileSigs;
      }

    } catch (err) {
      // ignore
    }
  }

  treeString += `${path.basename(root)}/\n`;
  await buildMap(root);

  res.json({
    tree: treeString,
    signatures
  });
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

// GET /git/status?root=/path/to/repo
app.get('/git/status', async (req, res) => {
  const root = path.resolve(String(req.query.root || WORKSPACE_ROOT).trim());
  if (!checkPathAccess(root, res)) return;
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: root });
    res.json({ status: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /git/commit { root, message }
app.post('/git/commit', async (req, res) => {
  const root = path.resolve(String(req.body.root || WORKSPACE_ROOT).trim());
  if (!checkPathAccess(root, res)) return;
  const message = req.body.message;
  if (!message) return res.status(400).json({ error: 'Commit message required' });
  try {
    await execAsync('git add .', { cwd: root });
    const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: root });
    res.json({ ok: true, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /git/push { root }
app.post('/git/push', async (req, res) => {
  const root = path.resolve(String(req.body.root || WORKSPACE_ROOT).trim());
  if (!checkPathAccess(root, res)) return;
  try {
    const { stdout, stderr } = await execAsync('git push', { cwd: root });
    res.json({ ok: true, output: stdout || stderr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /git/diff?path=/abs/path/to/file&root=/abs/path/to/repo
app.get('/git/diff', async (req, res) => {
  const root = path.resolve(String(req.query.root || WORKSPACE_ROOT).trim());
  if (!checkPathAccess(root, res)) return;
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'File path required' });

  try {
    // Get the relative path for git diff
    const relPath = path.relative(root, filePath);
    const { stdout } = await execAsync(`git diff "${relPath}"`, { cwd: root });
    res.json({ diff: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => console.log(`File server on http://127.0.0.1:${PORT}`));
