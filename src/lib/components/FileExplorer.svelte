<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { workspaceRoot, fileServerUrl, pinnedFiles, fileExplorerOpen, terminalCommand, terminalOpen } from '$lib/stores.js';
  import FileTree from '$lib/components/FileTree.svelte';
  import { parseGitHubUrl } from '$lib/github.js';

  const TREE_DEPTH = 4;
  let tree = $state([]);
  let loading = $state(false);
  let error = $state('');
  let expandedDirs = $state(new Set());
  let contextMenu = $state(null);
  let workspaceInput = $state('');
  let cloneModalOpen = $state(false);
  let cloneUrlInput = $state('');
  let cloneError = $state('');
  let shallowClone = $state(false);

  $effect(() => {
    workspaceInput = $workspaceRoot || '';
  });

  async function fetchTree() {
    const root = get(workspaceRoot)?.trim();
    let base = (get(fileServerUrl) || 'http://localhost:8768').replace(/\/$/, '');
    if (base.includes(':8766')) base = base.replace(':8766', ':8768');
    if (!root) {
      tree = [];
      return;
    }
    loading = true;
    error = '';
    try {
      const res = await fetch(`${base}/tree?root=${encodeURIComponent(root)}&depth=${TREE_DEPTH}`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      tree = Array.isArray(data) ? data : [];
    } catch (e) {
      error = e?.message || 'Failed to load tree';
      tree = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const root = $workspaceRoot;
    const base = $fileServerUrl;
    fetchTree();
  });

  function toggleDir(path) {
    expandedDirs = new Set(expandedDirs);
    if (expandedDirs.has(path)) expandedDirs.delete(path);
    else expandedDirs.add(path);
  }

  function setWorkspace() {
    workspaceRoot.set(workspaceInput?.trim() || '');
  }

  function openCloneModal() {
    cloneModalOpen = true;
    cloneUrlInput = '';
    cloneError = '';
    shallowClone = false;
  }

  function closeCloneModal() {
    cloneModalOpen = false;
    cloneUrlInput = '';
    cloneError = '';
  }

  function doClone() {
    const url = cloneUrlInput?.trim();
    if (!url) {
      cloneError = 'Enter a GitHub URL';
      return;
    }
    const parsed = parseGitHubUrl(url + '\n');
    if (!parsed) {
      cloneError = 'Invalid GitHub URL (e.g. github.com/owner/repo)';
      return;
    }
    const root = (get(workspaceRoot) || '').trim();
    if (!root) {
      cloneError = 'Set workspace root first.';
      return;
    }
    const cloneUrl = url.includes('://') ? url : `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    const repoName = parsed.repo.replace(/\.git$/, '');
    const targetPath = root.replace(/\/+$/, '') + '/' + repoName;
    const depthFlag = shallowClone ? ' --depth 1' : '';
    terminalCommand.set(`cd "${root.replace(/"/g, '\\"')}" && git clone${depthFlag} "${cloneUrl}"`);
    workspaceRoot.set(targetPath);
    workspaceInput = targetPath;
    terminalOpen.set(true);
    closeCloneModal();
    setTimeout(() => fetchTree(), 2000);
  }

  function pin(path) {
    const pinned = get(pinnedFiles) || [];
    if (pinned.includes(path)) return;
    pinnedFiles.set([...pinned, path]);
  }

  function unpin(path) {
    pinnedFiles.set((get(pinnedFiles) || []).filter((p) => p !== path));
  }

  function unpinAll() {
    pinnedFiles.set([]);
  }

  function copyPath(path) {
    navigator.clipboard?.writeText(path);
  }

  function onContextMenu(e, node) {
    e.preventDefault();
    contextMenu = {
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      isFile: node.type === 'file',
      isPinned: (get(pinnedFiles) || []).includes(node.path),
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  onMount(() => {
    function onKeydown(e) {
      if (e.key === 'Escape') closeContextMenu();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  $effect(() => {
    if (!contextMenu) return;
    const h = () => closeContextMenu();
    const t = setTimeout(() => document.addEventListener('click', h), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', h);
    };
  });

  /* Reactive: recompute when pinnedFiles store changes so pin icon and context menu stay in sync */
  const pinnedSet = $derived(new Set($pinnedFiles || []));
</script>

<div
  class="file-explorer flex flex-col shrink-0 border-r overflow-hidden min-w-0"
  style="width: 220px; max-width: 220px; background-color: var(--ui-bg-sidebar); border-color: var(--ui-border);"
>
  <div class="flex items-center gap-1.5 p-2 border-b shrink-0" style="border-color: var(--ui-border);">
    <button
      type="button"
      class="shrink-0 p-1 rounded hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)] transition-colors"
      title="Close file explorer (Ctrl+E)"
      aria-label="Close file explorer"
      onclick={() => fileExplorerOpen.set(false)}
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ui-text-secondary);"><path d="M15 19l-7-7 7-7" /></svg>
    </button>
    <input
      type="text"
      class="flex-1 min-w-0 rounded border px-2 py-1 text-xs font-mono"
      style="background: var(--ui-input-bg); border-color: var(--ui-border); color: var(--ui-text-primary);"
      placeholder="Workspace path"
      bind:value={workspaceInput}
      onkeydown={(e) => e.key === 'Enter' && setWorkspace()}
    />
    <button
      type="button"
      class="shrink-0 px-2 py-1 rounded text-xs font-medium"
      style="background: var(--ui-accent); color: var(--ui-bg-main);"
      onclick={setWorkspace}
      title="Set workspace root"
    >Set</button>
    <button
      type="button"
      class="shrink-0 px-2 py-1 rounded text-xs"
      style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
      onclick={openCloneModal}
      title="Clone GitHub repo into workspace"
    >Clone</button>
    {#if ($pinnedFiles || []).length > 0}
      <button
        type="button"
        class="shrink-0 px-2 py-1 rounded text-xs"
        style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
        onclick={unpinAll}
        title="Unpin all files"
      >Unpin all</button>
    {/if}
  </div>
  {#if cloneModalOpen}
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Clone GitHub repo"
    onclick={closeCloneModal}
  >
    <div
      class="rounded-xl shadow-xl border p-4 w-full max-w-md"
      style="background: var(--ui-bg-main); border-color: var(--ui-border);"
      onclick={(e) => e.stopPropagation()}
    >
      <h3 class="text-sm font-semibold mb-2" style="color: var(--ui-text-primary);">Clone repo to workspace</h3>
      <p class="text-xs mb-3" style="color: var(--ui-text-secondary);">Git clone will run in the terminal. Workspace will switch to the cloned folder.</p>
      <input
        type="text"
        class="w-full rounded border px-3 py-2 text-sm font-mono mb-2"
        style="background: var(--ui-input-bg); border-color: var(--ui-border); color: var(--ui-text-primary);"
        placeholder="github.com/owner/repo"
        bind:value={cloneUrlInput}
        onkeydown={(e) => e.key === 'Escape' && closeCloneModal()}
      />
      <label class="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="checkbox" bind:checked={shallowClone} />
        <span class="text-xs" style="color: var(--ui-text-secondary);">Shallow clone (--depth 1, faster, less history)</span>
      </label>
      {#if cloneError}
        <p class="text-xs mb-2" style="color: var(--ui-error, #dc2626);">{cloneError}</p>
      {/if}
      <div class="flex gap-2 justify-end">
        <button
          type="button"
          class="px-3 py-1.5 rounded text-sm"
          style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
          onclick={closeCloneModal}
        >Cancel</button>
        <button
          type="button"
          class="px-3 py-1.5 rounded text-sm font-medium"
          style="background: var(--ui-accent); color: white;"
          onclick={doClone}
        >Clone</button>
      </div>
    </div>
  </div>
{/if}

  <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5">
    {#if !(get(workspaceRoot) || '').trim()}
      <p class="text-xs py-2" style="color: var(--ui-text-secondary);">Set a workspace path to browse files.</p>
    {:else if loading}
      <p class="text-xs py-2" style="color: var(--ui-text-secondary);">Loading…</p>
    {:else if error}
      <p class="text-xs py-2" style="color: var(--ui-text-secondary);">{error}</p>
    {:else if tree.length === 0}
      <p class="text-xs py-2" style="color: var(--ui-text-secondary);">No files or start file server.</p>
    {:else}
      <FileTree
        nodes={tree}
        {expandedDirs}
        {pinnedSet}
        level={0}
        onToggleDir={toggleDir}
        onPin={pin}
        onUnpin={unpin}
        onCopyPath={copyPath}
        {onContextMenu}
      />
    {/if}
  </div>

  {#if contextMenu}
    <div
      class="fixed z-50 rounded border shadow-lg py-1 min-w-[140px]"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px; background: var(--ui-bg-sidebar); border-color: var(--ui-border);"
      role="menu"
    >
      {#if contextMenu.isPinned}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)]"
          style="color: var(--ui-text-primary);"
          onclick={() => { unpin(contextMenu.path); closeContextMenu(); }}
        >Unpin</button>
      {:else if contextMenu.isFile}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)]"
          style="color: var(--ui-text-primary);"
          onclick={() => { pin(contextMenu.path); closeContextMenu(); }}
        >📌 Pin as context</button>
      {/if}
      <button
        type="button"
        class="w-full text-left px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)]"
        style="color: var(--ui-text-primary);"
        onclick={() => { copyPath(contextMenu.path); closeContextMenu(); }}
      >Copy path</button>
    </div>
  {/if}
</div>
