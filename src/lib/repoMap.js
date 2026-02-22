/**
 * Phase 9A: Project indexing — repo map for codebase awareness.
 * Fetches workspace tree from file server, builds a text summary (file list),
 * stores it and exposes for system prompt injection and smart context.
 */

const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.svelte', '.vue',
  '.py', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.css', '.scss', '.html', '.md', '.json', '.yaml', '.yml', '.toml',
]);

const MAX_FILES_FOR_MAP = 200;
const MAX_MAP_CHARS = 4000;
const REPO_MAP_CACHE_KEY = 'atom_repo_map_cache';

/**
 * Flatten tree from file server into list of file paths (relative to root).
 * @param {Array<{ name: string, path: string, type: string, children?: Array }>} nodes
 * @param {string} root - workspace root path
 * @returns {string[]} absolute paths of code-like files
 */
export function flattenTreeToFiles(nodes, root) {
  const out = [];
  if (!nodes || !Array.isArray(nodes)) return out;
  const rootNorm = root.replace(/\/+$/, '') + '/';

  function walk(items) {
    for (const node of items) {
      if (node.type === 'file') {
        const ext = node.name.includes('.') ? '.' + node.name.split('.').pop().toLowerCase() : '';
        if (CODE_EXT.has(ext) || !ext) out.push(node.path);
      } else if (node.type === 'dir' && Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return out.slice(0, MAX_FILES_FOR_MAP);
}

/**
 * Build repo map text from list of absolute file paths.
 * @param {string[]} filePaths - absolute paths
 * @param {string} root - workspace root
 * @returns {string}
 */
export function buildRepoMapText(filePaths, root) {
  const rootNorm = root.replace(/\/+$/, '') + '/';
  const lines = filePaths.map((p) => {
    const rel = p.startsWith(rootNorm) ? p.slice(rootNorm.length) : p;
    return rel || p;
  }).sort((a, b) => a.localeCompare(b));
  const header = 'Current project structure (for context):\n';
  const body = lines.map((rel) => `- ${rel}`).join('\n');
  const full = header + body;
  return full.length > MAX_MAP_CHARS ? full.slice(0, MAX_MAP_CHARS) + '\n...' : full;
}

/**
 * Load cached repo map for a workspace root (if present and not stale).
 * @param {string} root
 * @returns {{ text: string, fileList: string[] } | null}
 */
export function getCachedRepoMap(root) {
  if (typeof localStorage === 'undefined' || !root?.trim()) return null;
  try {
    const raw = localStorage.getItem(REPO_MAP_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.root !== root) return null;
    if (data.text && Array.isArray(data.fileList)) return { text: data.text, fileList: data.fileList };
  } catch (_) {}
  return null;
}

/**
 * Save repo map to cache.
 * @param {string} root
 * @param {string} text
 * @param {string[]} fileList
 */
export function setCachedRepoMap(root, text, fileList) {
  if (typeof localStorage === 'undefined' || !root?.trim()) return;
  try {
    localStorage.setItem(REPO_MAP_CACHE_KEY, JSON.stringify({ root, text, fileList, updatedAt: Date.now() }));
  } catch (_) {}
}

/**
 * Fetch tree from file server and build repo map.
 * @param {string} root - workspace root path
 * @param {string} fileServerBase - e.g. http://localhost:8768
 * @returns {Promise<{ text: string, fileList: string[] }>}
 */
export async function buildRepoMap(root, fileServerBase) {
  const base = (fileServerBase || 'http://localhost:8768').replace(/\/$/, '').replace(':8766', ':8768');
  const res = await fetch(`${base}/tree?root=${encodeURIComponent(root)}&depth=5`);
  if (!res.ok) throw new Error(res.statusText || 'Failed to fetch tree');
  const tree = await res.json();
  const fileList = flattenTreeToFiles(Array.isArray(tree) ? tree : [], root);
  const text = buildRepoMapText(fileList, root);
  setCachedRepoMap(root, text, fileList);
  return { text, fileList };
}

/**
 * Get repo map for current workspace: use cache if available, else build and cache.
 * @param {string} root
 * @param {string} fileServerBase
 * @param {{ useCache?: boolean }} opts - if true, only return cache (don't fetch)
 * @returns {Promise<{ text: string, fileList: string[] } | null>}
 */
export async function getRepoMap(root, fileServerBase, opts = {}) {
  if (!root?.trim()) return null;
  if (opts.useCache) return getCachedRepoMap(root);
  const cached = getCachedRepoMap(root);
  try {
    const result = await buildRepoMap(root, fileServerBase);
    return result;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

/**
 * Phase 9B: Find up to maxFiles paths from fileList that best match the message text.
 * Uses simple keyword matching: words in message that appear in file path (filename or segment).
 * @param {string} messageText - user message
 * @param {string[]} fileList - absolute paths
 * @param {number} maxFiles
 * @returns {string[]} absolute paths to fetch
 */
export function findRelevantFiles(messageText, fileList, maxFiles = 3) {
  if (!messageText?.trim() || !fileList?.length) return [];
  const words = messageText
    .replace(/['"`]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && /[a-zA-Z0-9_]/.test(w));
  if (words.length === 0) return [];
  const scored = fileList.map((path) => {
    const lower = path.toLowerCase();
    const segments = path.split(/[/\\]/);
    const filename = segments[segments.length - 1] || '';
    let score = 0;
    for (const w of words) {
      const wl = w.toLowerCase();
      if (filename.includes(wl) || filename === wl) score += 10;
      if (lower.includes(wl)) score += 2;
    }
    return { path, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, maxFiles)
    .map((s) => s.path);
}
