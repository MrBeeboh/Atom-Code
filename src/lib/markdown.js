import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

function highlightCode(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch (_) { }
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

// @ts-ignore
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
      <button type="button" class="code-action-btn" data-action="copy" title="Copy code">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy
      </button>
      <button type="button" class="code-action-btn code-action-apply" data-action="edit" title="Apply to Editor">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        Apply to Editor
      </button>
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
  /** @type {{ type: 'thinking'|'answer', html: string }[]} */
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
