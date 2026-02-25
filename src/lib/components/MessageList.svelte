<script>
  import { tick } from "svelte";
  import {
    activeMessages,
    isStreaming,
    streamingContent,
  } from "$lib/stores.js";
  import MessageBubble from "$lib/components/MessageBubble.svelte";

  let listEl = $state(null);
  let prevStreaming = $state(false);
  let wasNearBottom = $state(true);

  const NEAR_BOTTOM_PX = 200;

  const msgs = $derived($activeMessages || []);
  const streamActive = $derived($isStreaming);
  const streamText = $derived($streamingContent);

  function isNearBottom(scrollParent) {
    if (!scrollParent) return false;
    const gap =
      scrollParent.scrollHeight -
      scrollParent.scrollTop -
      scrollParent.clientHeight;
    return gap <= NEAR_BOTTOM_PX;
  }

  function snapToBottom(scrollParent, smooth = false) {
    if (!scrollParent) return;
    if (smooth) {
      scrollParent.scrollTo({
        top: scrollParent.scrollHeight,
        behavior: "smooth",
      });
    } else {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  }

  // Effect 1: Message list changes or streaming starts/stops
  $effect(() => {
    // track dependencies
    msgs;
    const currentStreaming = streamActive;

    const scrollParent = listEl?.parentElement;
    if (scrollParent) {
      wasNearBottom = isNearBottom(scrollParent);
    }

    tick().then(() => {
      const parent = listEl?.parentElement;
      if (!parent) return;

      if (!currentStreaming) {
        if (prevStreaming && wasNearBottom) {
          snapToBottom(parent, true);
        }
        prevStreaming = false;
        return;
      }

      prevStreaming = true;
      if (wasNearBottom) {
        snapToBottom(parent, false);
      }
    });
  });

  // Effect 2: Content streams in
  $effect(() => {
    // Track text changes
    streamText;
    const currentStreaming = streamActive;

    if (currentStreaming) {
      const parent = listEl?.parentElement;
      if (parent && isNearBottom(parent)) {
        // Fast snap
        // Use requestAnimationFrame to let DOM update first if needed
        requestAnimationFrame(() => {
          snapToBottom(parent, false);
        });
      }
    }
  });
</script>

<div
  class="chat-message-list max-w-[56rem] mx-auto w-full px-4 pt-6 pb-10"
  bind:this={listEl}
>
  <div class="space-y-3">
    {#each msgs as msg, index (msg.id)}
      <div class="message-entrance">
        <MessageBubble
          message={msg}
          streaming={$isStreaming &&
            index === msgs.length - 1 &&
            msg.role === "assistant"}
          streamingContentOverride={$isStreaming &&
          index === msgs.length - 1 &&
          msg.role === "assistant"
            ? $streamingContent
            : undefined}
        />
      </div>
    {/each}
  </div>
</div>
