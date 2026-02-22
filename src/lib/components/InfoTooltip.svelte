<script>
  let { text, children } = $props();
  let show = $state(false);
  let rect = $state(null);

  function onEnter(e) {
    rect = e.currentTarget.getBoundingClientRect();
    show = true;
  }
  function onLeave() {
    show = false;
  }
</script>

<span
  role="img"
  aria-label={text}
  class="inline-flex shrink-0 relative"
  onmouseenter={onEnter}
  onmouseleave={onLeave}>
  {@render children?.()}
  {#if show && rect}
    {@const top = rect.top - 4}
    {@const left = rect.left + rect.width / 2}
    <div
      class="fixed z-[9999] px-2 py-1.5 rounded text-[13px] max-w-[220px] whitespace-normal pointer-events-none"
      style="left: {left}px; top: {top}px; transform: translate(-50%, -100%); background: var(--ui-bg-sidebar); color: var(--ui-text-primary); border: 1px solid var(--ui-border); box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
      {text}
    </div>
  {/if}
</span>
