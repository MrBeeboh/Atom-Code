<script>
  let {
    nodes = [],
    expandedDirs = new Set(),
    pinnedSet = new Set(),
    openFilePath = null,
    level = 0,
    onToggleDir,
    onPin,
    onUnpin,
    onOpenFile,
    onCopyPath,
    onContextMenu,
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
        class="w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs font-mono hover:bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)]"
        style="color: var(--ui-text-primary); margin-left: {level * 8}px;"
        onclick={() => onToggleDir?.(node.path)}
        oncontextmenu={(e) => onContextMenu?.(e, node)}
      >
        <span class="shrink-0 w-3"
          >{expandedDirs.has(node.path) ? "▼" : "▶"}</span
        >
        <span class="truncate">{node.name}/</span>
      </button>
      {#if expandedDirs.has(node.path) && node.children?.length}
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
        />
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
      class="file-tree-file w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs font-mono hover:bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)]"
      style="color: var(--ui-text-primary); margin-left: {level * 8 +
        12}px; {isOpen(node.path)
        ? 'background: color-mix(in srgb, var(--ui-accent) 14%, transparent); border-left: 2px solid var(--ui-accent);'
        : ''}"
      onclick={() => onOpenFile?.(node.path)}
      oncontextmenu={(e) => onContextMenu?.(e, node)}
    >
      {#if isOpen(node.path)}
        <span
          class="shrink-0 w-1.5 h-1.5 rounded-full"
          style="background: var(--ui-accent);"
          title="Open in editor"
        ></span>
      {/if}
      {#if pinnedSet.has(node.path)}
        <span class="shrink-0" title="Pinned">📌</span>
      {/if}
      <span class="truncate">{node.name}</span>
    </button>
  {/if}
{/each}
