<script>
  import { get } from "svelte/store";
  import hljs from "highlight.js";
  import { fileServerUrl } from "$lib/stores.js";
  import DiffWorker from "$lib/diffWorker?worker";

  let {
    originalCode = "",
    modifiedCode = "",
    filePath = "",
    onclose,
    onapply,
  } = $props();

  const extToLang = {
    js: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    svelte: "svelte",
    vue: "vue",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
  };

  function langFromPath(path) {
    if (!path) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    return ext ? extToLang[ext] || ext : null;
  }

  const lang = $derived(langFromPath(filePath));

  function highlightLine(line) {
    const str = line ?? "";
    if (str === "") return "&nbsp;";
    const l = lang && hljs.getLanguage(lang) ? lang : undefined;
    try {
      return l
        ? hljs.highlight(str, { language: l }).value
        : hljs.highlightAuto(str).value;
    } catch {
      return escapeHtml(str);
    }
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let lineChanges = $state([]);
  let computing = $state(false);
  let worker = null;

  $effect(() => {
    if (!worker && typeof Worker !== "undefined") {
      worker = new DiffWorker();
      worker.onmessage = (e) => {
        if (e.data.lines) {
          lineChanges = e.data.lines;
        }
        computing = false;
      };
    }

    const orig = originalCode ?? "";
    const mod = modifiedCode ?? "";

    computing = true;
    worker?.postMessage({ originalCode: orig, modifiedCode: mod });

    return () => {
      worker?.terminate();
      worker = null;
    };
  });

  let applying = $state(false);
  let applied = $state(false);

  async function applyChanges() {
    applying = true;
    applied = false;
    try {
      let base = (get(fileServerUrl) || "http://localhost:8768").replace(
        /\/$/,
        "",
      );
      if (base.includes(":8766")) base = base.replace(":8766", ":8768");
      const res = await fetch(`${base}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content: modifiedCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Write failed: ${res.status}`);
      }
      applied = true;
      setTimeout(() => {
        onapply?.();
        onclose?.();
      }, 1000);
    } catch (err) {
      console.error("Apply failed:", err);
    } finally {
      applying = false;
    }
  }

  function reject() {
    onclose?.();
  }
</script>

<div
  class="diff-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label="Diff viewer"
  tabindex="-1"
  onclick={(e) => e.target === e.currentTarget && reject()}
  onkeydown={(e) => e.key === "Escape" && reject()}
>
  <div class="diff-modal">
    <div class="diff-header">
      <span class="diff-file-path" title={filePath}
        >{filePath || "Untitled"}</span
      >
      <div class="diff-header-actions">
        <button
          type="button"
          class="diff-btn diff-btn-apply"
          disabled={applying}
          onclick={applyChanges}
        >
          {applying ? "Applying…" : applied ? "Applied!" : "Apply"}
        </button>
        <button type="button" class="diff-btn diff-btn-reject" onclick={reject}>
          Reject
        </button>
        <button
          type="button"
          class="diff-btn diff-btn-close"
          onclick={reject}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
    <div class="diff-body">
      {#if computing}
        <div class="diff-computing">
          <div class="diff-spinner"></div>
          <span>Computing differences…</span>
        </div>
      {:else}
        <div class="diff-lines">
          {#each lineChanges as line, i (i)}
            <div class="diff-line diff-line-{line.type}" data-type={line.type}>
              <span class="diff-num diff-num-old">{line.oldNum ?? "−"}</span>
              <span class="diff-num diff-num-new">{line.newNum ?? "−"}</span>
              <span class="diff-content">
                {@html highlightLine(line.text)}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .diff-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ui-bg-main) 40%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .diff-modal {
    width: 80%;
    max-width: 1200px;
    height: 70vh;
    max-height: 800px;
    display: flex;
    flex-direction: column;
    background: var(--ui-bg-main);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius, 8px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--ui-bg-sidebar);
    border-bottom: 1px solid var(--ui-border);
    flex-shrink: 0;
  }

  .diff-file-path {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8rem;
    color: var(--ui-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .diff-btn {
    padding: 0.35rem 0.6rem;
    border-radius: 4px;
    border: 1px solid transparent;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .diff-btn-apply {
    background: var(--ui-accent);
    color: white;
    border-color: var(--ui-accent);
  }

  .diff-btn-apply:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .diff-btn-apply:disabled {
    opacity: 0.8;
    cursor: not-allowed;
  }

  .diff-btn-reject {
    background: transparent;
    color: var(--ui-text-secondary);
    border-color: var(--ui-border);
  }

  .diff-btn-reject:hover {
    background: color-mix(in srgb, var(--ui-text-secondary) 15%, transparent);
  }

  .diff-btn-close {
    background: transparent;
    color: var(--ui-text-secondary);
    border: none;
    padding: 0.25rem 0.4rem;
  }

  .diff-btn-close:hover {
    background: color-mix(in srgb, var(--ui-text-secondary) 15%, transparent);
    color: var(--ui-text-primary);
  }

  .diff-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--ui-bg-main);
  }

  .diff-lines {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    line-height: 1.45;
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    min-height: 1.4em;
    white-space: pre;
  }

  .diff-num {
    flex-shrink: 0;
    width: 2.5rem;
    padding: 0 0.4rem;
    text-align: right;
    color: var(--ui-text-secondary);
    font-size: 0.85em;
    user-select: none;
    border-right: 1px solid var(--ui-border);
    background: color-mix(
      in srgb,
      var(--ui-text-secondary) 8%,
      var(--ui-bg-main)
    );
  }

  .diff-num-old {
    background: color-mix(
      in srgb,
      var(--ui-text-secondary) 10%,
      var(--ui-bg-main)
    );
  }

  .diff-num-new {
    background: color-mix(
      in srgb,
      var(--ui-text-secondary) 8%,
      var(--ui-bg-main)
    );
  }

  .diff-content {
    flex: 1;
    padding: 0 0.5rem;
    overflow-x: auto;
  }

  /* Diff viewer modal: strong contrast so added/removed are always visible */

  /* Light mode: added lines — clearly green */
  .diff-backdrop .diff-line-added .diff-content {
    background: #d4edda !important;
    color: #155724 !important;
  }
  .diff-backdrop .diff-line-added .diff-content :global(*) {
    color: inherit !important;
  }

  /* Light mode: removed lines — clearly red/pink */
  .diff-backdrop .diff-line-removed .diff-content {
    background: #f8d7da !important;
    color: #721c24 !important;
  }
  .diff-backdrop .diff-line-removed .diff-content :global(*) {
    color: inherit !important;
  }

  /* Unchanged: readable text */
  .diff-backdrop .diff-line-unchanged .diff-content {
    color: var(--ui-text-primary);
    background: var(--ui-bg-main);
  }

  /* Dark mode: added lines */
  :global(.dark) .diff-backdrop .diff-line-added .diff-content {
    background: rgba(40, 167, 69, 0.35) !important;
    color: #a3d9a5 !important;
  }
  :global(.dark) .diff-backdrop .diff-line-added .diff-content :global(*) {
    color: inherit !important;
  }

  /* Dark mode: removed lines */
  :global(.dark) .diff-backdrop .diff-line-removed .diff-content {
    background: rgba(220, 53, 69, 0.35) !important;
    color: #f5a5a5 !important;
  }
  :global(.dark) .diff-backdrop .diff-line-removed .diff-content :global(*) {
    color: inherit !important;
  }

  /* Dark mode: line number columns stay distinct */
  :global(.dark) .diff-num {
    background: color-mix(
      in srgb,
      var(--ui-text-secondary) 12%,
      var(--ui-bg-main)
    );
  }

  :global(.dark) .diff-num-old {
    background: color-mix(
      in srgb,
      var(--ui-text-secondary) 14%,
      var(--ui-bg-main)
    );
  }

  :global(.dark) .diff-num-new {
    background: color-mix(
      in srgb,
      var(--ui-text-secondary) 12%,
      var(--ui-bg-main)
    );
  }

  .diff-computing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--ui-text-secondary);
    font-size: 0.9rem;
  }

  .diff-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--ui-border);
    border-top-color: var(--ui-accent);
    border-radius: 50%;
    animation: diff-spin 0.8s linear infinite;
  }

  @keyframes diff-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
