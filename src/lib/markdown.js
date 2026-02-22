import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

function highlightCode(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch (_) {}
  }
  return hljs.highlightAuto(code).value;
}

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

marked.setOptions({
  highlight(code, lang) {
    return highlightCode(code, lang);
  },
});

marked.use({
  renderer: {
    code({ text, lang }) {
      const language = (lang || '').trim().toLowerCase();
      const highlighted = highlightCode(text, language || undefined);
      const langAttr = escapeHtml(language || 'plaintext');
      const langLabel = langAttr || 'plaintext';
      return `<div class="code-block-wrapper" data-language="${langAttr}">
  <div class="code-block-header">
    <span class="code-block-lang">${langLabel}</span>
    <div class="code-block-actions">
      <button type="button" class="code-action-btn" data-action="copy" title="Copy code">📋</button>
      <button type="button" class="code-action-btn" data-action="run" title="Run in terminal">▶</button>
      <button type="button" class="code-action-btn" data-action="save" title="Save to file">💾</button>
      <button type="button" class="code-action-btn" data-action="edit" title="Edit in editor">✎</button>
      <button type="button" class="code-action-btn" data-action="apply" title="Apply to file">✏️</button>
    </div>
  </div>
  <pre><code class="hljs language-${langAttr}">${highlighted}</code></pre>
</div>`;
    },
  },
});

/**
 * @param {string} raw
 * @returns {string} HTML string (use with {@html} in Svelte, or sanitize first)
 */
export function renderMarkdown(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return marked.parse(raw, { async: false });
}

/**
 * Split assistant content into thinking vs answer using think/reasoning/thought tags.
 * @param {string} raw
 * @returns {{ type: 'thinking'|'answer', html: string }[]} Empty if no thinking block found
 */
export function splitThinkingAndAnswer(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const thinkRe = /<(?:think|reasoning|thought)>([\s\S]*?)<\/(?:think|reasoning|thought)>/gi;
  const parts = [];
  let lastEnd = 0;
  let m;
  while ((m = thinkRe.exec(raw)) !== null) {
    if (m.index > lastEnd) {
      const answer = raw.slice(lastEnd, m.index).trim();
      if (answer) parts.push({ type: 'answer', html: renderMarkdown(answer) });
    }
    const thinking = m[1].trim();
    if (thinking) parts.push({ type: 'thinking', html: renderMarkdown(thinking) });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd === 0) return [];
  const tail = raw.slice(lastEnd).trim();
  if (tail) parts.push({ type: 'answer', html: renderMarkdown(tail) });
  return parts;
}
