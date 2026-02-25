<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import {
    workspaceRoot,
    fileServerUrl,
    pinnedFiles,
    fileExplorerOpen,
    terminalCommand,
    terminalOpen,
    editorContent,
    editorFilePath,
    editorLanguage,
    editorOpen,
  } from "$lib/stores.js";
  import FileTree from "$lib/components/FileTree.svelte";
  import { parseGitHubUrl } from "$lib/github.js";

  let { standalone = true } = $props();

  const TREE_DEPTH = 4;
  let tree = $state([]);
  let loading = $state(false);
  let error = $state("");
  let expandedDirs = $state(new Set());
  let contextMenu = $state(null);
  let workspaceInput = $state("");
  let cloneModalOpen = $state(false);
  let cloneUrlInput = $state("");
  let cloneError = $state("");
  let shallowClone = $state(true);

  let browseModalOpen = $state(false);
  let browseTree = $state([]);
  let browseLoading = $state(false);
  let browsePath = $state("");
  let browseError = $state(null);

  async function fetchBrowseTree(path = browsePath) {
    browseLoading = true;
    browseError = null;
    try {
      const url = get(fileServerUrl) || "http://localhost:8768";
      const res = await fetch(
        `${url}/tree?root=${encodeURIComponent(path)}&depth=1`,
      );
      if (!res.ok) throw new Error("Failed to fetch directory tree");
      const data = await res.json();
      browseTree = data.filter((n) => n.type === "dir");
      browsePath = path;
    } catch (err) {
      browseError = err.message;
    } finally {
      browseLoading = false;
    }
  }

  function openBrowse() {
    browsePath = workspaceInput.trim() || "/home/mike";
    browseModalOpen = true;
    fetchBrowseTree();
  }

  function selectBrowse(path) {
    fetchBrowseTree(path);
  }

  function confirmBrowse() {
    workspaceInput = browsePath;
    setWorkspace();
    browseModalOpen = false;
  }

  function goUpBrowse() {
    const parent = browsePath.substring(0, browsePath.lastIndexOf("/")) || "/";
    fetchBrowseTree(parent);
  }

  $effect(() => {
    workspaceInput = $workspaceRoot || "";
  });

  async function fetchTree() {
    const root = get(workspaceRoot)?.trim();
    let base = (get(fileServerUrl) || "http://localhost:8768").replace(
      /\/$/,
      "",
    );
    if (base.includes(":8766")) base = base.replace(":8766", ":8768");
    if (!root) {
      tree = [];
      return;
    }
    loading = true;
    error = "";
    try {
      const res = await fetch(
        `${base}/tree?root=${encodeURIComponent(root)}&depth=${TREE_DEPTH}`,
      );
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      tree = Array.isArray(data) ? data : [];
    } catch (e) {
      error = e?.message || "Failed to load tree";
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
    workspaceRoot.set(workspaceInput?.trim() || "");
  }

  function openCloneModal() {
    cloneModalOpen = true;
    cloneUrlInput = "";
    cloneError = "";
    shallowClone = false;
  }

  function closeCloneModal() {
    cloneModalOpen = false;
    cloneUrlInput = "";
    cloneError = "";
  }

  function doClone() {
    const url = cloneUrlInput?.trim();
    if (!url) {
      cloneError = "Enter a GitHub URL";
      return;
    }
    const parsed = parseGitHubUrl(url + "\n");
    if (!parsed) {
      cloneError = "Invalid GitHub URL (e.g. github.com/owner/repo)";
      return;
    }
    const root = (get(workspaceRoot) || "").trim();
    if (!root) {
      cloneError = "Set workspace root first.";
      return;
    }
    const cloneUrl = url.includes("://")
      ? url
      : `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    const repoName = parsed.repo.replace(/\.git$/, "");
    const targetPath = root.replace(/\/+$/, "") + "/" + repoName;
    const depthFlag = shallowClone ? " --depth 1" : "";
    terminalCommand.set(
      `cd "${root.replace(/"/g, '\\"')}" && git clone${depthFlag} "${cloneUrl}"`,
    );
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

  /** Map file extension to editor language (syntax highlighting). */
  function pathToEditorLang(filePath) {
    const ext = (filePath || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "py") return "python";
    if (["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(ext))
      return "javascript";
    if (["html", "htm", "svelte"].includes(ext)) return "html";
    if (ext === "css") return "css";
    if (ext === "json") return "json";
    return "javascript";
  }

  async function openFileInEditor(filePath) {
    const absPath = (filePath || "").trim().replace(/\/+$/, "") || "";
    if (!absPath) return;
    let base = (get(fileServerUrl) || "http://localhost:8768").replace(
      /\/$/,
      "",
    );
    if (base.includes(":8766")) base = base.replace(":8766", ":8768");
    try {
      const res = await fetch(
        `${base}/content?path=${encodeURIComponent(absPath)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      const content = typeof data.content === "string" ? data.content : "";
      editorContent.set(content);
      editorFilePath.set(absPath);
      editorLanguage.set(pathToEditorLang(absPath));
      editorOpen.set(true);
      if (!get(terminalOpen)) terminalOpen.set(true);
    } catch (e) {
      console.error("[FileExplorer] open in editor failed", e);
      error = e?.message || "Failed to load file";
    }
  }

  function onContextMenu(e, node) {
    e.preventDefault();
    contextMenu = {
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      isFile: node.type === "file",
      isPinned: (get(pinnedFiles) || []).includes(node.path),
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  onMount(() => {
    function onKeydown(e) {
      if (e.key === "Escape") closeContextMenu();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });

  $effect(() => {
    if (!contextMenu) return;
    const h = () => closeContextMenu();
    const t = setTimeout(() => document.addEventListener("click", h), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", h);
    };
  });

  /* Reactive: recompute when pinnedFiles store changes so pin icon and context menu stay in sync */
  const pinnedSet = $derived(new Set($pinnedFiles || []));
</script>

<div
  class="file-explorer flex flex-col shrink-0 overflow-hidden min-w-0"
  class:border-r={standalone}
  style="{standalone
    ? 'width: 280px; max-width: 280px;'
    : 'width: 100%; height: 100%;'} background-color: var(--ui-bg-sidebar); border-color: var(--ui-border);"
>
  <div
    class="flex flex-col gap-2 p-2 border-b shrink-0"
    style="border-color: var(--ui-border);"
  >
    <div class="w-full flex-col flex gap-1.5">
      <span
        class="text-[10px] font-semibold uppercase tracking-wider pl-1 block"
        style="color: var(--ui-text-secondary);">Local Workspace</span
      >
      <div class="flex items-center gap-1.5 w-full">
        {#if standalone}
          <button
            type="button"
            class="shrink-0 p-1 rounded hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)] transition-colors"
            title="Close file explorer (Ctrl+E)"
            aria-label="Close file explorer"
            onclick={() => fileExplorerOpen.set(false)}
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="color: var(--ui-text-secondary);"
              ><path d="M15 19l-7-7 7-7" /></svg
            >
          </button>
        {/if}
        <input
          type="text"
          class="flex-1 min-w-0 rounded border px-2 py-1 text-xs font-mono"
          style="background: var(--ui-input-bg); border-color: var(--ui-border); color: var(--ui-text-primary);"
          placeholder="/home/user/project"
          bind:value={workspaceInput}
          onkeydown={(e) => e.key === "Enter" && setWorkspace()}
        />
        <button
          type="button"
          class="shrink-0 px-2 py-1 rounded text-xs font-medium"
          style="background: var(--ui-accent); color: var(--ui-bg-main);"
          onclick={setWorkspace}
          title="Set workspace root">Set</button
        >
        <button
          type="button"
          class="shrink-0 px-2 py-1 rounded text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
          onclick={openBrowse}
          title="Browse local folders">Browse</button
        >
      </div>
    </div>

    <div class="w-full flex-col flex gap-1.5 mt-1">
      <span
        class="text-[10px] font-semibold uppercase tracking-wider pl-1 block"
        style="color: var(--ui-text-secondary);">GitHub</span
      >
      <div class="flex items-center gap-1.5 w-full">
        <button
          type="button"
          class="flex-1 px-2 py-1 rounded text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
          onclick={openCloneModal}
          title="Clone GitHub repo into workspace"
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
              d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
            ></path></svg
          >
          Clone Repository
        </button>
        {#if ($pinnedFiles || []).length > 0}
          <button
            type="button"
            class="flex-1 px-2 py-1 rounded text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
            onclick={unpinAll}
            title="Unpin all files">Unpin all</button
          >
        {/if}
      </div>
    </div>
  </div>
  {#if browseModalOpen}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-all fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Browse Directory"
      onclick={() => (browseModalOpen = false)}
    >
      <div
        class="rounded-xl shadow-2xl border p-4 w-full max-w-lg flex flex-col gap-3 min-h-[400px] max-h-[80vh] scale-in"
        style="background: var(--ui-bg-main); border-color: var(--ui-border);"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold"
            style="color: var(--ui-text-primary);"
          >
            Choose Workspace
          </h3>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded transition-colors hover:bg-black/5"
            style="color: var(--ui-text-secondary);"
            onclick={() => (browseModalOpen = false)}>Close</button
          >
        </div>

        <div
          class="flex items-center gap-2 p-2 rounded bg-black/5 dark:bg-white/5"
        >
          <button
            type="button"
            class="shrink-0 p-1 rounded hover:bg-black/10"
            onclick={goUpBrowse}
            title="Go to parent directory"
          >
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"><path d="M11 19l-7-7 7-7M4 12h16" /></svg
            >
          </button>
          <span
            class="text-xs font-mono truncate flex-1"
            style="color: var(--ui-text-secondary);">{browsePath}</span
          >
        </div>

        <div
          class="flex-1 overflow-y-auto border rounded min-h-0"
          style="border-color: var(--ui-border);"
        >
          {#if browseLoading}
            <div
              class="p-4 text-center text-xs animate-pulse"
              style="color: var(--ui-text-secondary);"
            >
              Scanning folders...
            </div>
          {:else if browseError}
            <div class="p-4 text-center text-xs text-red-500">
              {browseError}
            </div>
          {:else if browseTree.length === 0}
            <div
              class="p-4 text-center text-xs"
              style="color: var(--ui-text-secondary);"
            >
              No subdirectories here.
            </div>
          {:else}
            <div class="flex flex-col">
              {#each browseTree as node}
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-black/5 dark:hover:bg-white/5 border-b border-black/5 last:border-0"
                  style="color: var(--ui-text-primary);"
                  onclick={() => selectBrowse(node.path)}
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    style="color: var(--ui-accent);"
                    ><path
                      d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
                    /></svg
                  >
                  <span class="truncate">{node.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div
          class="flex gap-2 justify-end pt-2 border-t"
          style="border-color: var(--ui-border);"
        >
          <button
            type="button"
            class="px-4 py-2 rounded text-xs font-medium transition-all active:scale-95"
            style="background: var(--ui-accent); color: var(--ui-bg-main);"
            onclick={confirmBrowse}>Select Folder</button
          >
        </div>
      </div>
    </div>
  {/if}

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
        <h3
          class="text-sm font-semibold mb-2"
          style="color: var(--ui-text-primary);"
        >
          Clone repo to workspace
        </h3>
        <p class="text-xs mb-3" style="color: var(--ui-text-secondary);">
          Git clone will run in the terminal. Workspace will switch to the
          cloned folder.
        </p>
        <input
          type="text"
          class="w-full rounded border px-3 py-2 text-sm font-mono mb-2"
          style="background: var(--ui-input-bg); border-color: var(--ui-border); color: var(--ui-text-primary);"
          placeholder="github.com/owner/repo"
          bind:value={cloneUrlInput}
          onkeydown={(e) => e.key === "Escape" && closeCloneModal()}
        />
        <label class="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="checkbox" bind:checked={shallowClone} />
          <span class="text-xs" style="color: var(--ui-text-secondary);"
            >Shallow clone (--depth 1, faster, less history)</span
          >
        </label>
        {#if cloneError}
          <p class="text-xs mb-2" style="color: var(--ui-error, #dc2626);">
            {cloneError}
          </p>
        {/if}
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            class="px-3 py-1.5 rounded text-sm"
            style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
            onclick={closeCloneModal}>Cancel</button
          >
          <button
            type="button"
            class="px-3 py-1.5 rounded text-sm font-medium"
            style="background: var(--ui-accent); color: white;"
            onclick={doClone}>Clone</button
          >
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5">
    {#if !(get(workspaceRoot) || "").trim()}
      <div
        class="flex flex-col items-center justify-center pt-8 px-4 text-center text-[11px] gap-2"
        style="color: var(--ui-text-secondary);"
      >
        <p>No workspace selected.</p>
        <p>Set a local path above or clone a GitHub repo.</p>
      </div>
    {:else if loading}
      <p
        class="text-[11px] py-2 px-2 text-center"
        style="color: var(--ui-text-secondary);"
      >
        Loading files…
      </p>
    {:else if error}
      <p
        class="text-[11px] py-2 px-2 text-center"
        style="color: var(--ui-error, #dc2626);"
      >
        {error}
      </p>
    {:else if tree.length === 0}
      <div
        class="flex flex-col items-center justify-center pt-8 px-4 text-center text-[11px] gap-2"
        style="color: var(--ui-text-secondary);"
      >
        <p>This workspace is empty or the file server is not running.</p>
      </div>
    {:else}
      <FileTree
        nodes={tree}
        {expandedDirs}
        {pinnedSet}
        openFilePath={$editorFilePath}
        level={0}
        onToggleDir={toggleDir}
        onPin={pin}
        onUnpin={unpin}
        onOpenFile={openFileInEditor}
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
          onclick={() => {
            unpin(contextMenu.path);
            closeContextMenu();
          }}>Unpin</button
        >
      {:else if contextMenu.isFile}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)]"
          style="color: var(--ui-text-primary);"
          onclick={() => {
            pin(contextMenu.path);
            closeContextMenu();
          }}>📌 Pin as context</button
        >
      {/if}
      <button
        type="button"
        class="w-full text-left px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)]"
        style="color: var(--ui-text-primary);"
        onclick={() => {
          copyPath(contextMenu.path);
          closeContextMenu();
        }}>Copy path</button
      >
    </div>
  {/if}
</div>
