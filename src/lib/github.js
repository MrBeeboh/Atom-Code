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
const MAX_FILES_TO_FETCH = 15;
const MAX_TOTAL_CHARS = 12000;

/**
 * Build context string for a repo: tree summary + key file contents.
 * @param {string} owner
 * @param {string} repo
 * @param {string} [token]
 * @returns {Promise<string>}
 */
export async function fetchRepoContext(owner, repo, token) {
  const info = await fetchRepoInfo(owner, repo, token);
  const defaultBranch = info.default_branch || 'main';
  const tree = await fetchTree(owner, repo, defaultBranch, token);

  const pathList = tree.map((n) => n.path).sort((a, b) => a.localeCompare(b));
  const maxList = 250;
  const listLines = pathList.length <= maxList
    ? pathList.map((p) => `- ${p}`).join('\n')
    : pathList.slice(0, maxList).map((p) => `- ${p}`).join('\n') + `\n... and ${pathList.length - maxList} more files`;
  const treeSummary = `Repository: ${owner}/${repo} (branch: ${defaultBranch})\nFile list:\n${listLines}`;

  let totalChars = treeSummary.length;
  const parts = [treeSummary];

  const toFetch = [];
  for (const key of KEY_FILES) {
    const found = pathList.find((p) => p === key || p.endsWith('/' + key));
    if (found) toFetch.push(found);
  }
  for (const path of pathList) {
    if (toFetch.length >= MAX_FILES_TO_FETCH) break;
    const ext = path.includes('.') ? path.split('.').pop() : '';
    if (['.md', '.json', '.toml', '.yaml', '.yml'].includes('.' + ext) && !path.includes('node_modules') && !toFetch.includes(path)) {
      toFetch.push(path);
    }
  }
  toFetch.splice(MAX_FILES_TO_FETCH);

  for (const path of toFetch) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const content = await fetchFileContent(owner, repo, path, defaultBranch, token);
    if (content && content.length < 8000) {
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

/**
 * If text contains GitHub URLs, fetch first repo's context. Returns context string or empty.
 * @param {string} text - user message
 * @param {string} [token] - GitHub PAT
 * @returns {Promise<string>}
 */
export async function injectGitHubContextIfPresent(text, token) {
  const first = parseGitHubUrl(text);
  if (!first) return '';
  try {
    const context = await fetchRepoContext(first.owner, first.repo, token);
    return `[GitHub repo ${first.owner}/${first.repo} — contents below for context]\n\n${context}\n\n--- End of repo context. User message follows ---\n\n`;
  } catch (e) {
    console.warn('[github]', e?.message);
    return '';
  }
}
