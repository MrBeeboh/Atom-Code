<script>
  import FileTree from "./FileTree.svelte";
  let {
    nodes = [],
    expandedDirs = {},
    pinnedSet = new Set(),
    openFilePath = null,
    level = 0,
    onToggleDir,
    onPin,
    onUnpin,
    onOpenFile,
    onCopyPath,
    onContextMenu,
    forceExpanded = false,
  } = $props();
  function isOpen(path) {
    if (!path || !openFilePath) return false;
    const a = (path + "").replace(/\/+$/, "");
    const b = (openFilePath + "").replace(/\/+$/, "");
    return a === b;
  }
</script>

{#each nodes || [] as node (node.path)}
  {#if node.type === "dir"}
    <div class="file-tree-dir">
      <button
        type="button"
        class="w-full text-left flex items-center gap-1.5 py-0.5 px-1.5 rounded-md text-[11px] font-medium hover:bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)] transition-colors group relative"
        style="color: var(--ui-text-primary); margin-left: {level * 10}px;"
        onclick={() => onToggleDir?.(node.path)}
        oncontextmenu={(e) => onContextMenu?.(e, node)}
      >
        <!-- Connector Line -->
        {#if level > 0}
          <div
            class="absolute left-[-6px] top-[-10px] bottom-1/2 w-[1px] bg-white/5 group-hover:bg-white/10 transition-colors"
          ></div>
        {/if}

        <span
          class="shrink-0 w-3.5 h-3.5 flex items-center justify-center transition-transform duration-200"
          style="transform: rotate({forceExpanded || expandedDirs[node.path]
            ? '90deg'
            : '0deg'})"
        >
          <svg
            class="w-2 h-2 opacity-50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg
          >
        </span>
        <svg
          class="w-3.5 h-3.5 text-[var(--ui-accent)] opacity-80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path
            d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"
          /><path d="M6.5 2H20v20H6.5" /><path d="M6.5 18H20" /></svg
        >
        <span class="truncate">{node.name}</span>
      </button>
      {#if forceExpanded || expandedDirs[node.path]}
        {#if node.children?.length}
          <div class="relative">
            <!-- Vertical Guideline -->
            <div
              class="absolute left-0 top-0 bottom-0 w-[1px] bg-white/5"
              style="margin-left: {level * 10 + 6}px;"
            ></div>
            <FileTree
              nodes={node.children}
              {expandedDirs}
              {pinnedSet}
              {openFilePath}
              level={level + 1}
              {onToggleDir}
              {onPin}
              {onUnpin}
              {onOpenFile}
              {onCopyPath}
              {onContextMenu}
              {forceExpanded}
            />
          </div>
        {:else}
          <div
            class="text-[10px] italic opacity-40 py-0.5"
            style="margin-left: {(level + 1) * 8 +
              12}px; color: var(--ui-text-secondary);"
          >
            (empty)
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <button
      type="button"
      draggable="true"
      ondragstart={(e) => {
        e.dataTransfer.setData("text/plain", `@${node.path}`);
        e.dataTransfer.setData("application/atom-file-path", node.path);
      }}
      class="file-tree-file w-full text-left flex items-center gap-1.5 py-0.5 px-1.5 rounded-md text-[11px] font-medium hover:bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)] transition-colors group relative"
      style="color: var(--ui-text-primary); margin-left: {level * 10 +
        14}px; {isOpen(node.path)
        ? 'background: color-mix(in srgb, var(--ui-accent) 14%, transparent); font-weight: bold;'
        : ''}"
      onclick={() => onOpenFile?.(node.path)}
      oncontextmenu={(e) => onContextMenu?.(e, node)}
    >
      <!-- Connector Line -->
      <div
        class="absolute left-[-14px] top-1/2 w-[10px] h-[1px] bg-white/5 opacity-50"
      ></div>

      {#if pinnedSet.has(node.path)}
        <div
          class="w-1 h-1 rounded-full bg-orange-400 shadow-[0_0_4px_rgba(251,146,60,0.5)]"
        ></div>
      {/if}

      <svg
        class="w-3.5 h-3.5 opacity-40 group-hover:opacity-80 transition-opacity"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path
          d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
        /><polyline points="14 2 14 8 20 8" /></svg
      >
      <span class="truncate">{node.name}</span>

      {#if isOpen(node.path)}
        <div
          class="ml-auto w-1 h-3 rounded-full bg-[var(--ui-accent)] shadow-[0_0_8px_var(--ui-accent)] scale-in"
        ></div>
      {/if}
    </button>
  {/if}
{/each}
