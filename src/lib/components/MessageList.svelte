<script>
  import { tick } from 'svelte';
  import { activeMessages, isStreaming } from '$lib/stores.js';
  import MessageBubble from '$lib/components/MessageBubble.svelte';

  let listEl;
  let lastScrollTime = 0;
  let prevStreaming = false;

  const NEAR_BOTTOM_PX = 100;
  const SCROLL_THROTTLE_MS = 50;

  $: msgs = $activeMessages;

  function scrollToBottom(smooth) {
    const scrollParent = listEl?.parentElement;
    if (!scrollParent) return;
    if (smooth) {
      scrollParent.scrollTo({ top: scrollParent.scrollHeight, behavior: 'smooth' });
    } else {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  }

  function isNearBottom(scrollParent) {
    if (!scrollParent) return false;
    const gap = scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight;
    return gap <= NEAR_BOTTOM_PX;
  }

  $: msgs, (() => {
    const scrollParent = listEl?.parentElement;
    const wasNearBottom = scrollParent ? isNearBottom(scrollParent) : false;
    const streaming = $isStreaming;

    tick().then(() => {
      const parent = listEl?.parentElement;
      if (!parent) return;

      if (!streaming) {
        if (prevStreaming) {
          scrollToBottom(true);
        }
        prevStreaming = false;
        return;
      }

      prevStreaming = true;
      if (!wasNearBottom) return;

      const now = Date.now();
      if (now - lastScrollTime >= SCROLL_THROTTLE_MS) {
        lastScrollTime = now;
        scrollToBottom(false);
      }
    });
  })();
</script>

<div class="chat-message-list max-w-[56rem] mx-auto w-full px-4 pt-6 pb-10" bind:this={listEl}>
  <div class="space-y-6">
    {#each msgs as msg (msg.id)}
      <div class="message-entrance">
        <MessageBubble message={msg} />
      </div>
    {/each}
  </div>
</div>
