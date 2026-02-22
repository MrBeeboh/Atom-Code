<script>
  import { renderMarkdown, splitThinkingAndAnswer } from "$lib/markdown.js";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { get } from "svelte/store";
  import PerfStats from "$lib/components/PerfStats.svelte";
  import AuthVideo from "$lib/components/AuthVideo.svelte";
  import { pinnedContent, deepinfraApiKey, terminalCommand, terminalOpen, fileServerUrl, workspaceRoot, pinnedFiles, diffViewerState } from "$lib/stores.js";

  /** DeepInfra key: init from store + env so it's there on first paint; subscribe to stay in sync with Settings. */
  let deepinfraKey = $state(
    (get(deepinfraApiKey)?.trim() || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEEPINFRA_API_KEY) || '').trim(),
  );
  $effect(() => {
    const unsub = deepinfraApiKey.subscribe((v) => {
      const k = (typeof v === 'string' ? v : '').trim()
        || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEEPINFRA_API_KEY || '').trim();
      deepinfraKey = k;
    });
    return () => unsub();
  });

  let { message, streaming = false } = $props();
  const isUser = $derived(message.role === "user");
  const isAssistant = $derived(message.role === "assistant");
  const content = $derived(
    typeof message.content === "string" ? message.content : "",
  );
  const contentArray = $derived(
    Array.isArray(message.content) ? message.content : [],
  );
  const imageRefs = $derived(
    Array.isArray(message.imageRefs) ? message.imageRefs : [],
  );
  const imageUrls = $derived(
    Array.isArray(message.imageUrls) ? message.imageUrls : [],
  );
  const videoUrls = $derived(
    Array.isArray(message.videoUrls) ? message.videoUrls : [],
  );
  const parts = $derived(
    isAssistant && content ? splitThinkingAndAnswer(content) : [],
  );
  const hasThinkingOrAnswer = $derived(parts.length > 0);
  const imageThumbUrls = $derived(
    isAssistant && content && content.includes('[Image: http')
      ? Array.from(content.matchAll(/\[Image: (https?:\/\/[^\]]+)\]/g)).map((m) => m[1])
      : []
  );
  const html = $derived(
    isAssistant && content && !hasThinkingOrAnswer
      ? renderMarkdown(content)
      : "",
  );

  let copyFeedback = $state(false);
  let pinFeedback = $state(false);
  /** When user clicks Apply on a code block: { code } to show file picker; null to hide. */
  let applyToFilePending = $state(/** @type {{ code: string } | null} */ (null));
  let applyToFilePathInput = $state("");
  let applyToFileLoading = $state(false);
  let applyToFileError = $state("");

  function copyContent() {
    const text =
      content ||
      contentArray.map((p) => (p.type === "text" ? p.text : "")).join("");
    if (text) {
      navigator.clipboard?.writeText(text);
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 1500);
    }
  }
  function pinContent() {
    const text =
      content ||
      contentArray.map((p) => (p.type === "text" ? p.text : "")).join("");
    if (text) {
      pinnedContent.set(text);
      pinFeedback = true;
      setTimeout(() => {
        pinFeedback = false;
      }, 1500);
    }
  }

  const LANG_EXT = {
    python: "py",
    javascript: "js",
    typescript: "ts",
    bash: "sh",
    sh: "sh",
    html: "html",
    css: "css",
    json: "json",
    svelte: "svelte",
  };

  function handleCodeAction(event) {
    const btn = event.target.closest(".code-action-btn");
    if (!btn) return;
    const wrapper = btn.closest(".code-block-wrapper");
    const codeEl = wrapper?.querySelector("pre code");
    if (!codeEl) return;
    const code = codeEl.textContent ?? "";
    const action = btn.dataset.action;

    if (action === "copy") {
      navigator.clipboard?.writeText(code);
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = orig;
      }, 1500);
    }
    if (action === "run") {
      terminalCommand.set(code);
      terminalOpen.set(true);
    }
    if (action === "save") {
      const lang = (wrapper?.dataset.language || "txt").toLowerCase();
      const ext = LANG_EXT[lang] ?? "txt";
      const blob = new Blob([code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snippet.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
    if (action === "apply") {
      applyToFilePending = { code };
      applyToFilePathInput = "";
      applyToFileError = "";
    }
  }

  function resolveApplyPath(pathInput) {
    const raw = (pathInput || "").trim();
    if (!raw) return null;
    if (raw.startsWith("/")) return raw.replace(/\/+/g, "/");
    const root = (get(workspaceRoot) || "").replace(/\/+$/, "");
    return (root ? root + "/" : "") + raw.replace(/^\/+/, "").replace(/\/+/g, "/");
  }

  async function openDiffForApply() {
    const path = resolveApplyPath(applyToFilePathInput);
    if (!path || !applyToFilePending?.code) return;
    applyToFileError = "";
    applyToFileLoading = true;
    try {
      let base = (get(fileServerUrl) || "http://localhost:8768").replace(/\/$/, "");
      if (base.includes(':8766')) base = base.replace(':8766', ':8768');
      const res = await fetch(`${base}/content?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to read file: ${res.status}`);
      }
      const data = await res.json();
      const originalCode = data.content ?? "";
      diffViewerState.set({
        originalCode,
        modifiedCode: applyToFilePending.code,
        filePath: path,
      });
      applyToFilePending = null;
    } catch (err) {
      applyToFileError = err instanceof Error ? err.message : String(err);
    } finally {
      applyToFileLoading = false;
    }
  }

  function pickPinnedFile(path) {
    applyToFilePathInput = path;
  }

  function cancelApplyToFile() {
    applyToFilePending = null;
    applyToFileError = "";
  }
</script>

<div
  class="flex {isUser ? 'justify-end' : 'justify-start'} w-full max-w-[56rem]"
  in:fly={{ y: 20, duration: 380, easing: quintOut }}
>
  <div
    class="message-bubble-inner w-full rounded-[12px] px-4 py-3 shadow-sm relative overflow-hidden
      {isUser
      ? 'ui-user-bubble'
      : 'bg-white dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80'}
      {streaming ? ' streaming-bubble' : ''}"
  >
    {#if isUser}
      {#if contentArray.length}
        <div class="space-y-2">
          {#each contentArray as part}
            {#if part.type === "text"}
              <p class="whitespace-pre-wrap">{part.text}</p>
            {:else if part.type === "image_url"}
              <img
                src={part.image_url?.url}
                alt="Attached"
                class="max-w-full max-h-48 rounded object-contain"
              />
            {/if}
          {/each}
        </div>
      {:else}
        <p class="whitespace-pre-wrap">{content}</p>
      {/if}
      {#if videoUrls.length}
        <div class="mt-2 flex flex-col gap-2">
          {#each videoUrls as url (url)}
            <div class="rounded-lg overflow-hidden max-w-md">
              <video
                src={url}
                controls
                class="w-full max-h-64 object-contain rounded-lg"
                preload="metadata"
                aria-label="Attached video"
              >
                <track kind="captions" />
                Your browser does not support the video tag.
              </video>
            </div>
          {/each}
        </div>
      {/if}
    {:else if isAssistant}
      <div class="message-assistant-body" onclick={handleCodeAction} role="presentation">
      {#if !content}
        <div class="flex items-center py-1" aria-label="Thinking">
          <svg
            class="thinking-atom-icon w-8 h-8"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="16" cy="16" r="3" class="thinking-atom-nucleus" />
            <ellipse
              cx="16"
              cy="16"
              rx="10"
              ry="4"
              class="thinking-atom-orbit"
            />
            <ellipse
              cx="16"
              cy="16"
              rx="12"
              ry="5"
              class="thinking-atom-orbit-2"
            />
            <ellipse
              cx="16"
              cy="16"
              rx="11"
              ry="4.5"
              class="thinking-atom-orbit-3"
            />
          </svg>
        </div>
      {:else if hasThinkingOrAnswer}
        <div class="prose-chat prose dark:prose-invert max-w-none space-y-3">
          {#each parts as part}
            <div
              class:assistant-thinking={part.type === "thinking"}
              class:assistant-answer={part.type === "answer"}
            >
              {@html part.html}
            </div>
          {/each}
        </div>
      {:else}
        <div class="prose-chat prose dark:prose-invert max-w-none">
          {@html html}
          {#if content && content.includes('[Image: http')}
            <div class="mt-2 flex flex-wrap gap-3">
              {#each imageThumbUrls as url}
                <img src={url} alt="Result image" class="max-h-32 rounded border border-zinc-200 dark:border-zinc-600" loading="lazy" />
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      </div>
      {#if applyToFilePending}
        <div
          class="apply-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Apply code to file"
          tabindex="-1"
          onclick={(e) => e.target === e.currentTarget && cancelApplyToFile()}
          onkeydown={(e) => e.key === 'Escape' && cancelApplyToFile()}
        >
          <div class="apply-picker-panel" role="document" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <div class="apply-picker-title">Apply to file</div>
            <p class="apply-picker-hint">Path relative to workspace or absolute</p>
            <input
              type="text"
              class="apply-picker-input"
              placeholder={get(workspaceRoot) ? get(workspaceRoot) + "/" : "e.g. src/App.svelte"}
              bind:value={applyToFilePathInput}
              onkeydown={(e) => e.key === 'Enter' && openDiffForApply()}
            />
            {#if get(pinnedFiles)?.length}
              <div class="apply-picker-quick">Quick pick:</div>
              <div class="apply-picker-pinned">
                {#each get(pinnedFiles) as fp (fp)}
                  <button type="button" class="apply-picker-pinned-btn" onclick={() => pickPinnedFile(fp)}>
                    {fp}
                  </button>
                {/each}
              </div>
            {/if}
            {#if applyToFileError}
              <p class="apply-picker-error">{applyToFileError}</p>
            {/if}
            <div class="apply-picker-actions">
              <button type="button" class="apply-picker-btn apply-picker-btn-primary" disabled={applyToFileLoading} onclick={openDiffForApply}>
                {applyToFileLoading ? "Loading…" : "Open diff"}
              </button>
              <button type="button" class="apply-picker-btn apply-picker-btn-cancel" onclick={cancelApplyToFile}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      {/if}
      {#if isAssistant && imageRefs.length}
        <div class="mt-3 flex gap-2 overflow-x-auto pb-1 rounded-lg" role="list" aria-label="Searched images">
          {#each imageRefs as ref (ref.image_id)}
            <div class="shrink-0 rounded border border-zinc-200 dark:border-zinc-600 overflow-hidden bg-zinc-100 dark:bg-zinc-800/80" role="listitem">
              <img
                src={"https://cdn.x.ai/images?id=" + ref.image_id + "&size=" + (ref.size === "SMALL" ? "SMALL" : "LARGE")}
                alt={"Searched image (ID: " + ref.image_id + ")"}
                class="max-h-48 w-auto object-contain"
                loading="lazy"
              />
              <p class="p-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">ID: {ref.image_id}</p>
            </div>
          {/each}
        </div>
      {/if}
      {#if isAssistant && imageUrls.length}
        <div class="mt-3 flex gap-2 overflow-x-auto pb-1 rounded-lg" role="list" aria-label="Generated images">
          {#each imageUrls as url (url)}
            <div class="shrink-0 rounded border border-zinc-200 dark:border-zinc-600 overflow-hidden bg-zinc-100 dark:bg-zinc-800/80" role="listitem">
              <img
                src={url}
                alt=""
                class="max-h-64 w-auto object-contain"
                loading="lazy"
              />
            </div>
          {/each}
        </div>
      {/if}
      {#if isAssistant && videoUrls.length}
        <div class="mt-3 flex flex-col gap-2" role="list" aria-label="Generated videos">
          {#each videoUrls as url (url)}
            <div class="rounded border border-zinc-200 dark:border-zinc-600 overflow-hidden bg-zinc-100 dark:bg-zinc-800/80 max-w-2xl" role="listitem">
              <AuthVideo url={url} apiKey={deepinfraKey} />
            </div>
          {/each}
        </div>
      {/if}
      {#if isAssistant && (content.includes('Generated image') || content.includes('Generated video')) && !imageUrls.length && !videoUrls.length}
        <p class="mt-2 text-sm text-amber-600 dark:text-amber-400">Media could not be loaded. Try generating again and ensure your DeepInfra API key is set in Settings.</p>
      {/if}
    {/if}

    <!-- Copy/Pin buttons for ALL messages (User or Assistant) -->
    {#if (isUser && (content || contentArray.length)) || (isAssistant && (content || hasThinkingOrAnswer))}
      <div
        class="flex items-center gap-1 mt-2 pt-2 {isUser ? 'justify-end' : ''}"
      >
        <!-- Copy button with clipboard icon -->
        <button
          type="button"
          class="flex items-center gap-1 text-[10px] px-2 py-1 rounded border {isUser
            ? 'border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-800/50'
            : 'border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700/80'} transition-all duration-200"
          style="color: {copyFeedback
            ? 'var(--ui-accent, #22c55e)'
            : isUser
              ? 'inherit'
              : 'var(--ui-text-secondary)'};"
          onclick={copyContent}
          title={copyFeedback ? "Copied!" : "Copy to clipboard"}
        >
          {#if copyFeedback}
            <!-- Checkmark icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="20 6 9 17 4 12"></polyline></svg
            >
            <span>Copied!</span>
          {:else}
            <!-- Clipboard icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><rect x="9" y="9" width="13" height="13" rx="2" ry="2"
              ></rect><path
                d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
              ></path></svg
            >
          {/if}
        </button>
        <!-- Pin button with pin icon -->
        <button
          type="button"
          class="flex items-center gap-1 text-[10px] px-2 py-1 rounded border {isUser
            ? 'border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-800/50'
            : 'border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700/80'} transition-all duration-200"
          style="color: {pinFeedback
            ? 'var(--ui-accent, #22c55e)'
            : isUser
              ? 'inherit'
              : 'var(--ui-text-secondary)'};"
          onclick={pinContent}
          title={pinFeedback ? "Pinned!" : "Pin to Workbench"}
        >
          {#if pinFeedback}
            <!-- Checkmark icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><polyline points="20 6 9 17 4 12"></polyline></svg
            >
            <span>Pinned!</span>
          {:else}
            <!-- Pin icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><line x1="12" y1="17" x2="12" y2="22"></line><path
                d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"
              ></path></svg
            >
          {/if}
        </button>
      </div>
      {#if isAssistant && (message.stats || content)}
        <div class="perf-stats-wrap mt-2 flex justify-start">
          <PerfStats
            stats={message.stats}
            contentLength={content.length}
            elapsedMs={message.stats?.elapsed_ms}
          />
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .message-bubble-inner {
    font-size: 14px;
    line-height: 1.5;
  }
  .message-bubble-inner.streaming-bubble {
    will-change: contents;
    contain: layout style;
  }
  .apply-picker-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ui-bg-main) 50%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 900;
    padding: 1rem;
  }
  .apply-picker-panel {
    background: var(--ui-bg-sidebar);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius, 8px);
    padding: 1rem 1.25rem;
    min-width: 320px;
    max-width: 90vw;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }
  .apply-picker-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ui-text-primary);
    margin-bottom: 0.25rem;
  }
  .apply-picker-hint {
    font-size: 0.75rem;
    color: var(--ui-text-secondary);
    margin-bottom: 0.5rem;
  }
  .apply-picker-input {
    width: 100%;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: var(--ui-bg-main);
    color: var(--ui-text-primary);
    margin-bottom: 0.75rem;
  }
  .apply-picker-quick {
    font-size: 0.75rem;
    color: var(--ui-text-secondary);
    margin-bottom: 0.25rem;
  }
  .apply-picker-pinned {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }
  .apply-picker-pinned-btn {
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    background: color-mix(in srgb, var(--ui-accent) 15%, transparent);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-primary);
    cursor: pointer;
  }
  .apply-picker-pinned-btn:hover {
    background: color-mix(in srgb, var(--ui-accent) 25%, transparent);
  }
  .apply-picker-error {
    font-size: 0.8rem;
    color: #ef4444;
    margin-bottom: 0.5rem;
  }
  .apply-picker-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .apply-picker-btn {
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .apply-picker-btn-primary {
    background: var(--ui-accent);
    color: white;
  }
  .apply-picker-btn-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  .apply-picker-btn-cancel {
    background: transparent;
    color: var(--ui-text-secondary);
    border-color: var(--ui-border);
  }
  .apply-picker-btn-cancel:hover {
    background: color-mix(in srgb, var(--ui-text-secondary) 15%, transparent);
  }
</style>
