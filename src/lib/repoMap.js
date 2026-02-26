import { writable } from 'svelte/store';

/**
 * Phase 2: Repo Map Codebase Indexing
 */

export const repoMapText = writable('');

export async function buildRepoMapText(root, fileServerBase = 'http://localhost:8768') {
  if (!root || typeof root !== 'string' || !root.trim()) {
    return '';
  }

  const base = fileServerBase.replace(/\/$/, '').replace(':8766', ':8768');
  let treeData;
  try {
    const res = await fetch(`${base}/repomap?path=${encodeURIComponent(root)}`);
    if (!res.ok) return '';
    treeData = await res.json();
  } catch (err) {
    return '';
  }

  if (treeData.error) return '';

  const projectName = root.split(/[/\\]/).pop() || 'Unknown';
  const timestamp = new Date().toISOString();

  const topPart = `<repo_map>\nPROJECT: ${projectName}\nPATH: ${root}\nGENERATED: ${timestamp}\n\nDIRECTORY STRUCTURE:\n${treeData.tree || ''}\n\nCODE SIGNATURES:\n`;

  const signatures = treeData.signatures || {};
  let sigKeys = Object.keys(signatures);
  sigKeys.sort();

  function buildSigs(keys) {
    let result = '';
    for (const key of keys) {
      result += `### ${key}\n`;
      const sigs = signatures[key] || [];
      for (const mapSig of sigs) {
        result += `${mapSig}\n`;
      }
      result += '\n';
    }
    return result;
  }

  let finalMap = topPart + buildSigs(sigKeys) + '</repo_map>\n';

  if (finalMap.length > 16000) {
    sigKeys = sigKeys.filter(k => k.includes('/') || k.includes('\\'));
    finalMap = topPart + buildSigs(sigKeys) + '</repo_map>\n';
  }

  if (finalMap.length > 16000) {
    sigKeys = sigKeys.filter(k => !k.startsWith('scripts/') && !k.startsWith('scripts\\'));
    finalMap = topPart + buildSigs(sigKeys) + '</repo_map>\n';
  }

  if (finalMap.length > 16000) {
    sigKeys = sigKeys.filter(k => k.startsWith('src/') || k.startsWith('src\\'));
    finalMap = topPart + buildSigs(sigKeys) + '</repo_map>\n';
  }

  if (finalMap.length > 16000) {
    let truncSigs = buildSigs(sigKeys);
    let allowedLen = 16000 - topPart.length - 15;
    if (allowedLen > 0) {
      finalMap = topPart + truncSigs.slice(0, allowedLen) + '\n\n</repo_map>\n';
    } else {
      finalMap = topPart.slice(0, 15980) + '\n\n</repo_map>\n';
    }
  }

  console.log(finalMap.slice(0, 500));
  return finalMap;
}

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
