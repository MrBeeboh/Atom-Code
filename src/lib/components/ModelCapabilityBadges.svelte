<script>
  import { getModelCapabilities } from '$lib/modelCapabilities.js';

  let { modelId = '', class: className = '' } = $props();
  const caps = $derived(getModelCapabilities(modelId));
  const showAny = $derived(caps.vision || caps.tools || caps.thinking || caps.json);
</script>

{#if showAny}
  <span class="model-capability-badges flex items-center gap-1 shrink-0 {className}" role="group" aria-label="Model capabilities">
    {#if caps.vision}
      <span class="cap-badge cap-badge-vision" title="Vision / multimodal (images, PDF pages)">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
    {/if}
    {#if caps.tools}
      <span class="cap-badge cap-badge-tools" title="Tool / function calling">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </span>
    {/if}
    {#if caps.thinking}
      <span class="cap-badge cap-badge-thinking" title="Thinking / reasoning (extended chain-of-thought)">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
        </svg>
      </span>
    {/if}
    {#if caps.json}
      <span class="cap-badge cap-badge-json" title="JSON / structured output">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
          <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
        </svg>
      </span>
    {/if}
  </span>
{/if}

<style>
  .model-capability-badges {
    /* gap and layout only; colors per badge */
  }
  .cap-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    padding: 1px;
  }
  .cap-badge svg {
    display: block;
  }
  /* Vision: blue/indigo – easy to spot for “see” */
  .cap-badge-vision {
    color: #4f46e5;
  }
  :global(.dark) .cap-badge-vision {
    color: #818cf8;
  }
  /* Tools: amber – “build/tool” */
  .cap-badge-tools {
    color: #b45309;
  }
  :global(.dark) .cap-badge-tools {
    color: #fbbf24;
  }
  /* Thinking: teal – “deep thought” */
  .cap-badge-thinking {
    color: #0d9488;
  }
  :global(.dark) .cap-badge-thinking {
    color: #2dd4bf;
  }
  /* JSON: slate/purple – “data” */
  .cap-badge-json {
    color: #64748b;
  }
  :global(.dark) .cap-badge-json {
    color: #94a3b8;
  }
</style>
