import { writable, get } from 'svelte/store';
import { repoMapText, repoMapSignatures } from './stores.js';

/**
 * Phase 2: Repo Map Codebase Indexing
 */

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
  repoMapSignatures.set(signatures);
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

const STOP_WORDS = new Set([
  "what", "where", "which", "this", "that", "with", "from", "have", "does", "work",
  "function", "defined", "inside", "about", "tell", "show", "explain", "find",
  "return", "returns", "call", "calls", "used", "using"
]);

export function findRelevantFiles(messageText, fileList, signatures = {}, maxFiles = 3) {
  if (!messageText?.trim() || !fileList?.length) return [];

  // Extract and clean words from message (keep dot for filename matching)
  const words = messageText
    .replace(/[()[\]{},;:'"`]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && /[a-z0-9_]/.test(w));

  if (words.length === 0) return [];

  const fileScores = new Map();

  // Helper to add score
  const addScore = (path, points, isFileMatch = false) => {
    const current = fileScores.get(path) || { score: 0, fileMatches: 0, sigMatches: 0 };
    current.score += points;
    if (isFileMatch) current.fileMatches++;
    else current.sigMatches++;
    fileScores.set(path, current);
  };

  // Pass 1: Filename matching (Keep existing logic conceptually, update scoring)
  for (const path of fileList) {
    const lower = path.toLowerCase();
    const segments = path.split(/[/\\]/);
    const filename = segments[segments.length - 1] || '';
    const basename = filename.split('.')[0] || filename;

    for (const w of words) {
      if (filename === w) {
        addScore(path, 50, true); // High score for exact filename
      } else if (filename.includes(w) || basename === w || basename.includes(w)) {
        addScore(path, 10, true);
      } else if (lower.includes(w)) {
        addScore(path, 2, true);
      }
    }
  }

  // Pass 2: Signature matching
  for (const [relPath, sigs] of Object.entries(signatures)) {
    // We need the absolute path from the fileList that matches this relPath
    // Usually relPath is the tail end of the absolute path.
    const absPath = fileList.find(p => p.endsWith(relPath.replace(/\\/g, '/')) || p.endsWith(relPath.replace(/\//g, '\\')));
    if (!absPath) continue;

    for (const sig of sigs) {
      const cleanSig = sig.replace(/[()[\]{},.;:'"`]/g, ' ').toLowerCase();
      for (const w of words) {
        if (cleanSig.includes(w)) {
          addScore(absPath, 5, false); // 5 points per signature match
        }
      }
    }
  }

  // Convert map to array and compute final ranking
  const scored = Array.from(fileScores.entries()).map(([path, data]) => ({
    path,
    score: data.score,
    fileMatches: data.fileMatches,
    sigMatches: data.sigMatches
  }));

  // Filter out zero scores
  const validScored = scored.filter(s => s.score > 0);

  // Sorting logic based on rules:
  // 1. Files with multiple signature matches rank higher than files with single matches (handled by score weighting inherently, but we can explicitly rank)
  // 2. Filename matches rank higher than signature-only matches
  validScored.sort((a, b) => {
    // If one has file matches and the other doesn't, file match wins
    if (a.fileMatches > 0 && b.fileMatches === 0) return -1;
    if (b.fileMatches > 0 && a.fileMatches === 0) return 1;

    // If both are signature-only matches, the one with MORE signature matches wins
    if (a.fileMatches === 0 && b.fileMatches === 0) {
      if (a.sigMatches !== b.sigMatches) {
        return b.sigMatches - a.sigMatches;
      }
    }

    // Default to total score
    return b.score - a.score;
  });

  return validScored.slice(0, maxFiles).map(s => s.path);
}
