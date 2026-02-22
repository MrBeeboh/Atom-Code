<script>
  let { stats, contentLength = 0, elapsedMs: propElapsedMs } = $props();
  const completion = $derived(stats?.completion_tokens ?? Math.max(1, Math.ceil(contentLength / 4)));
  const elapsedMs = $derived(stats?.elapsed_ms ?? propElapsedMs ?? 0);
  const elapsedSec = $derived(elapsedMs / 1000);
  const tokensPerSec = $derived(elapsedSec > 0 ? (completion / elapsedSec).toFixed(1) : '—');
  const promptTokens = $derived(stats?.prompt_tokens ?? 0);
  const isEstimated = $derived(stats?.estimated ?? !stats?.completion_tokens);
</script>

<div class="perf-stats text-[10px] pt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5" style="color: var(--ui-text-secondary); border-top: 1px solid var(--ui-border);">
  <span><span class="font-medium" style="color: var(--ui-accent);">{tokensPerSec}</span> tok/s</span>
  {#if completion}
    <span>{completion} tokens</span>
  {/if}
  {#if promptTokens}
    <span>{promptTokens} prompt</span>
  {/if}
  {#if elapsedMs}
    <span>{elapsedMs}ms</span>
  {/if}
  {#if isEstimated}
    <span class="opacity-75">(est.)</span>
  {/if}
</div>
