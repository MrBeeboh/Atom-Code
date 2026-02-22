/**
 * Phase 10A: GitHub integration — fetch repo tree and file contents for context.
 * Public repos: no auth. Private repos: use GitHub PAT from settings (never sent to model).
 */

const GITHUB_API = 'https://api.github.com';

/** Match github.com/owner/repo or https://github.com/owner/repo or github.com/owner/repo/ */
const GITHUB_URL_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\/|\.git)?(?:\s|$|[),])/g;

/**
 * Extract owner/repo from text. Returns first match or null.
 * @param {string} text
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGitHubUrl(text) {
  if (!text || typeof text !== 'string') return null;
  GITHUB_URL_RE.lastIndex = 0;
  const m = GITHUB_URL_RE.exec(text);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

/**
 * Extract all owner/repo pairs from text (unique).
 * @param {string} text
 * @returns {Array<{ owner: string, repo: string }>}
 */
export function parseAllGitHubUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  let m;
  GITHUB_URL_RE.lastIndex = 0;
  while ((m = GITHUB_URL_RE.exec(text)) !== null) {
    const owner = m[1];
    const repo = m[2].replace(/\.git$/, '');
    const key = `${owner}/${repo}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ owner, repo });
    }
  }
  return out;
}

/**
 * Fetch repo info (default branch, etc.).
 * @param {string} owner
 * @param {string} repo
 * @param {string} [token] - GitHub PAT for private repos
 */
async function fetchRepoInfo(owner, repo, token) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(res.status === 404 ? 'Repo not found' : `GitHub API ${res.status}`);
  return res.json();
}

/**
 * Fetch recursive tree for a branch.
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref - branch name (e.g. main)
 * @param {string} [token]
 */
async function fetchTree(owner, repo, ref, token) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub tree ${res.status}`);
  const data = await res.json();
  return (data.tree || []).filter((n) => n.type === 'blob' && n.path);
}

/**
 * Fetch file content (Contents API returns base64).
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @param {string} [token]
 */
async function fetchFileContent(owner, repo, path, ref, token) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.content && data.encoding === 'base64') {
    try {
      return atob(data.content.replace(/\s/g, ''));
    } catch (_) {
      return null;
    }
  }
  return null;
}

const KEY_FILES = ['README.md', 'README', 'package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pyproject.toml'];
const MAX_FILES_TO_FETCH = 4;
const MAX_TOTAL_CHARS = 7000;
const FILE_LIST_MAX_LINES = 80;

/**
 * Build context string for a repo: short tree summary + README-first file contents.
 * Keeps context small so "summarize the README" etc. are fast.
 */
export async function fetchRepoContext(owner, repo, token) {
  const info = await fetchRepoInfo(owner, repo, token);
  const defaultBranch = info.default_branch || 'main';
  const tree = await fetchTree(owner, repo, defaultBranch, token);

  const pathList = tree.map((n) => n.path).sort((a, b) => a.localeCompare(b));
  const listLines = pathList.length <= FILE_LIST_MAX_LINES
    ? pathList.map((p) => `- ${p}`).join('\n')
    : pathList.slice(0, FILE_LIST_MAX_LINES).map((p) => `- ${p}`).join('\n') + `\n... and ${pathList.length - FILE_LIST_MAX_LINES} more files`;
  const treeSummary = `Repository: ${owner}/${repo} (branch: ${defaultBranch})\nFile list:\n${listLines}`;

  let totalChars = treeSummary.length;
  const parts = [treeSummary];

  // Prefer README and a few key files only (so "summarize the README" gets mostly README)
  const toFetch = [];
  for (const key of KEY_FILES) {
    const found = pathList.find((p) => p === key || p.endsWith('/' + key));
    if (found) toFetch.push(found);
  }
  toFetch.splice(MAX_FILES_TO_FETCH);

  for (const path of toFetch) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const content = await fetchFileContent(owner, repo, path, defaultBranch, token);
    if (content && content.length < 6000) {
      totalChars += content.length + 100;
      if (totalChars > MAX_TOTAL_CHARS) {
        parts.push(`\n--- ${path} ---\n${content.slice(0, Math.max(0, content.length - (totalChars - MAX_TOTAL_CHARS)))}`);
      } else {
        parts.push(`\n--- ${path} ---\n${content}`);
      }
    }
  }

  return parts.join('\n\n');
}

const GITHUB_CACHE_PREFIX = 'github:context:';
const GITHUB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedGitHubContext(owner, repo) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GITHUB_CACHE_PREFIX + owner + ':' + repo);
    if (!raw) return null;
    const { context, fetchedAt } = JSON.parse(raw);
    if (typeof context !== 'string' || !fetchedAt) return null;
    if (Date.now() - fetchedAt > GITHUB_CACHE_TTL_MS) return null;
    return context;
  } catch (_) {
    return null;
  }
}

function setCachedGitHubContext(owner, repo, context) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(GITHUB_CACHE_PREFIX + owner + ':' + repo, JSON.stringify({ context, fetchedAt: Date.now() }));
  } catch (_) {}
}

/**
 * If text contains GitHub URLs, fetch first repo's context (or use 1h cache). Returns context string or empty.
 * @param {string} text - user message
 * @param {string} [token] - GitHub PAT
 * @returns {Promise<string>}
 */
export async function injectGitHubContextIfPresent(text, token) {
  const first = parseGitHubUrl(text);
  if (!first) return '';
  const header = `[GitHub repo ${first.owner}/${first.repo} — contents below for context. When the user asks about this repo (e.g. README, files, or "what is X"), answer from this content; do not suggest curl or other ways to fetch it.]\n\n`;
  const footer = `\n\n--- End of repo context. User message follows ---\n\n`;
  const cached = getCachedGitHubContext(first.owner, first.repo);
  if (cached) return header + cached + footer;
  try {
    const context = await fetchRepoContext(first.owner, first.repo, token);
    const full = context;
    setCachedGitHubContext(first.owner, first.repo, full);
    return header + full + footer;
  } catch (e) {
    console.warn('[github]', e?.message);
    return '';
  }
}
