<script>
  /**
   * Renders a video. For DeepInfra URLs we try direct load first; if that fails (e.g. auth/CORS),
   * we show a link to open the video in a new tab where it often works.
   */
  let { url = '', apiKey = '' } = $props();
  /** true when <video> fired error (e.g. 403 or CORS) */
  let directLoadFailed = $state(false);

  const key = $derived((apiKey || '').trim());
  const isDataUrl = $derived(url && typeof url === 'string' && url.startsWith('data:'));
  const isDeepInfra = $derived(url && typeof url === 'string' && url.includes('api.deepinfra.com'));
  const showNoKey = $derived(!isDataUrl && isDeepInfra && !key);
  const showFallbackLink = $derived(directLoadFailed && url && !isDataUrl);

  $effect(() => {
    url;
    directLoadFailed = false;
  });

  function onVideoError() {
    directLoadFailed = true;
  }
</script>

{#if showNoKey}
  <p class="text-sm text-amber-600 dark:text-amber-400 py-2">Add your DeepInfra API key in Settings to play this video.</p>
{:else if showFallbackLink}
  <div class="py-2 space-y-2">
    <p class="text-sm text-amber-600 dark:text-amber-400">Video couldn't play in the page.</p>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      class="text-sm text-blue-600 dark:text-blue-400 underline hover:no-underline"
    >Open video in new tab</a>
  </div>
{:else}
  <video
    src={url}
    controls
    class="w-full max-h-96 object-contain"
    preload="metadata"
    aria-label="Generated video"
    onerror={onVideoError}
  >
    <track kind="captions" />
    Your browser does not support the video tag.
  </video>
{/if}
