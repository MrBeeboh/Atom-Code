<script>
  import { chatInputPrefill } from '$lib/stores.js';

  async function prefill(prefix) {
    let text = prefix;
    try {
      const clip = await navigator.clipboard?.readText?.();
      if (clip?.trim()) text += clip.trim();
    } catch (_) {}
    chatInputPrefill.set(text);
  }
</script>

<div class="quick-actions flex flex-wrap items-center justify-center gap-2 max-w-[56rem] mx-auto w-full">
  <button
    type="button"
    class="quick-action-btn px-2.5 py-1 text-sm font-medium transition-colors"
    style="color: var(--ui-text-secondary);"
    onclick={() => prefill('Explain this code:\n\n')}
    title="Prefill with prompt and paste clipboard"
  >💡 Explain</button>
  <button
    type="button"
    class="quick-action-btn px-2.5 py-1 text-sm font-medium transition-colors"
    style="color: var(--ui-text-secondary);"
    onclick={() => prefill('Fix the bugs in this code:\n\n')}
    title="Prefill with prompt and paste clipboard"
  >🐛 Fix</button>
  <button
    type="button"
    class="quick-action-btn px-2.5 py-1 text-sm font-medium transition-colors"
    style="color: var(--ui-text-secondary);"
    onclick={() => prefill('Refactor this code:\n\n')}
    title="Prefill with prompt and paste clipboard"
  >♻️ Refactor</button>
  <button
    type="button"
    class="quick-action-btn px-2.5 py-1 text-sm font-medium transition-colors"
    style="color: var(--ui-text-secondary);"
    onclick={() => prefill('Write tests for this code:\n\n')}
    title="Prefill with prompt and paste clipboard"
  >🧪 Test</button>
  <button
    type="button"
    class="quick-action-btn px-2.5 py-1 text-sm font-medium transition-colors"
    style="color: var(--ui-text-secondary);"
    onclick={() => prefill('Add documentation to this code:\n\n')}
    title="Prefill with prompt and paste clipboard"
  >📝 Document</button>
</div>

<style>
  .quick-action-btn:hover {
    color: var(--ui-text-primary);
    background: color-mix(in srgb, var(--ui-text-secondary) 12%, transparent);
  }
  @media (max-width: 480px) {
    .quick-actions {
      display: none;
    }
  }
</style>
