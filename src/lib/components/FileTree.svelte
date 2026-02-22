<script>
  let { nodes = [], expandedDirs = new Set(), pinnedSet = new Set(), level = 0, onToggleDir, onPin, onUnpin, onCopyPath, onContextMenu } = $props();
</script>

{#each nodes || [] as node (node.path)}
  {#if node.type === 'dir'}
    <div class="file-tree-dir">
      <button
        type="button"
        class="w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs font-mono hover:bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)]"
        style="color: var(--ui-text-primary); margin-left: {level * 8}px;"
        onclick={() => onToggleDir?.(node.path)}
        oncontextmenu={(e) => onContextMenu?.(e, node)}
      >
        <span class="shrink-0 w-3">{expandedDirs.has(node.path) ? '▼' : '▶'}</span>
        <span class="truncate">{node.name}/</span>
      </button>
      {#if expandedDirs.has(node.path) && node.children?.length}
        <FileTree
          nodes={node.children}
          {expandedDirs}
          {pinnedSet}
          level={level + 1}
          {onToggleDir}
          {onPin}
          {onUnpin}
          {onCopyPath}
          {onContextMenu}
        />
      {/if}
    </div>
  {:else}
    <button
      type="button"
      class="w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs font-mono hover:bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)]"
      style="color: var(--ui-text-primary); margin-left: {level * 8 + 12}px;"
      onclick={() => onPin?.(node.path)}
      oncontextmenu={(e) => onContextMenu?.(e, node)}
    >
      {#if pinnedSet.has(node.path)}
        <span class="shrink-0" title="Pinned">📌</span>
      {/if}
      <span class="truncate">{node.name}</span>
    </button>
  {/if}
{/each}
