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
    repoMapText,
    repoMapFileList,
    repoMapLoading,
    repoMapError,
    isTauri,
  } from "$lib/stores.js";
  import { repoMapSignatures } from "$lib/repoMap.js";
  import { addMessage } from "$lib/db.js";
  import { activeConversationId } from "$lib/stores.js";
  import FileTree from "$lib/components/FileTree.svelte";
  import { parseGitHubUrl } from "$lib/github.js";
  import * as tauriFs from "$lib/tauriFs.js";

  let { standalone = true } = $props();

  const TREE_DEPTH = 4;
  let tree = $state([]);
  let loading = $state(false);
  let error = $state("");
  let expandedDirs = $state({});
  let contextMenu = $state(null);
  let workspaceInput = $state("");
  let workspaceEditMode = $state(false);
  let workspaceEditInput = $state("");
  let cloneModalOpen = $state(false);
  let cloneUrlInput = $state("");
  let cloneError = $state("");
  let shallowClone = $state(true);

  let browseModalOpen = $state(false);
  let browseTree = $state([]);
  let browseLoading = $state(false);
  let browsePath = $state("");
  let browseError = $state(null);
  let workspaceHistory = $state([]);
  let searchQuery = $state("");

  const filteredTree = $derived.by(() => {
    if (!searchQuery.trim()) return tree;
    const query = searchQuery.toLowerCase();

    function filterNodes(nodes) {
      return nodes
        .map((node) => {
          if (node.type === "file") {
            return node.name.toLowerCase().includes(query) ? node : null;
          }
          const children = filterNodes(node.children || []);
          if (children.length > 0 || node.name.toLowerCase().includes(query)) {
            return { ...node, children };
          }
          return null;
        })
        .filter(Boolean);
    }
    return filterNodes(tree);
  });

  const forceExpandedOnSearch = $derived(searchQuery.trim().length > 0);

  onMount(() => {
    const stored = localStorage.getItem("workspaceHistory");
    if (stored) {
      try {
        workspaceHistory = JSON.parse(stored);
      } catch (e) {
        workspaceHistory = [];
      }
    }
    // Add default shortcuts if not present
    const home = "/home/mike";
    const root = "/";
    if (!workspaceHistory.includes(home)) workspaceHistory.push(home);
    if (!workspaceHistory.includes(root)) workspaceHistory.push(root);
  });

  function addToHistory(path) {
    if (!path) return;
    const next = [path, ...workspaceHistory.filter((p) => p !== path)].slice(
      0,
      5,
    );
    workspaceHistory = next;
    localStorage.setItem("workspaceHistory", JSON.stringify(next));
  }

  async function openBrowse(startPath = "") {
    browseLoading = false;
    browseError = null;
    browsePath = (
      startPath ||
      workspaceInput ||
      get(workspaceRoot) ||
      "/home/mike"
    ).trim();

    // 1. Tauri: try native OS picker
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Choose Workspace Folder",
          defaultPath: browsePath,
        });
        if (selected) {
          setWorkspace(selected);
          return;
        }
      } catch (_) {
        // fall through to modal
      }
    } else {
      // 2. Browser: try the file server's native picker (/pick-directory → zenity/kdialog)
      const server = get(fileServerUrl);
      if (server) {
        try {
          const res = await fetch(
            `${server}/pick-directory?path=${encodeURIComponent(browsePath)}`,
          );
          const data = await res.json();
          if (res.ok && data.path) {
            setWorkspace(data.path);
            return; // picked successfully, no modal needed
          }
          // If picker not available, fall through to modal
        } catch (_) {
          // network error → fall through to modal
        }
      }
    }

    // 3. Fallback: show the directory-browser modal
    browseModalOpen = true;
    fetchBrowseTree();
  }

  async function fetchBrowseTree(dirPath = browsePath) {
    browseLoading = true;
    browseError = null;
    browsePath = dirPath;
    try {
      if (isTauri) {
        const data = await tauriFs.listDirectory(dirPath);
        browseTree = data.filter((n) => n.is_dir);
      } else {
        // Use file-server /list-dir endpoint
        const server = get(fileServerUrl);
        if (!server)
          throw new Error(
            "File server not running. Start atom-code or set a path manually.",
          );
        const res = await fetch(
          `${server}/list-dir?path=${encodeURIComponent(dirPath)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to list directory");
        browseTree = data;
      }
    } catch (err) {
      browseError = err.message;
      browseTree = [];
    } finally {
      browseLoading = false;
    }
  }

  function goUpBrowse() {
    const parent = browsePath.replace(/\/[^/]+\/?$/, "") || "/";
    fetchBrowseTree(parent);
  }

  $effect(() => {
    workspaceInput = $workspaceRoot || "";
  });

  async function fetchTree() {
    const root = get(workspaceRoot)?.trim();
    if (!root) {
      tree = [];
      return;
    }
    loading = true;
    error = "";
    try {
      if (isTauri) {
        // Tauri: just fetch top-level; children loaded lazily on expand
        const data = await tauriFs.listDirectory(root, false);
        // Ensure each dir node has children: null (meaning "not yet loaded")
        tree = data.map((n) =>
          n.is_dir
            ? { ...n, type: "dir", children: null }
            : { ...n, type: "file" },
        );
      } else {
        // Browser: use file-server /tree endpoint (returns fully nested structure)
        const server = get(fileServerUrl);
        if (!server)
          throw new Error(
            "File server not running — run npm run dev:services or start ATOM Code",
          );
        const res = await fetch(
          `${server}/tree?root=${encodeURIComponent(root)}&depth=4`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load file tree");
        tree = data;
      }
    } catch (e) {
      error = e?.message || "Failed to load file tree";
      tree = [];
    } finally {
      loading = false;
    }
  }

  /** Recursively update a node (by path) in the tree */
  function updateNodeChildren(nodes, targetPath, children) {
    return nodes.map((n) => {
      if (n.path === targetPath) return { ...n, children };
      if (n.children?.length)
        return {
          ...n,
          children: updateNodeChildren(n.children, targetPath, children),
        };
      return n;
    });
  }

  async function toggleDir(path) {
    if (expandedDirs[path]) {
      // Collapse
      const updated = { ...expandedDirs };
      delete updated[path];
      expandedDirs = updated;
    } else {
      // Expand — lazy-load children in Tauri mode
      expandedDirs = { ...expandedDirs, [path]: true };
      if (isTauri) {
        // Check if children not yet loaded
        const node = findNode(tree, path);
        if (node && node.children === null) {
          try {
            const children = await tauriFs.listDirectory(path, false);
            const normalized = children.map((n) =>
              n.is_dir || n.type === "dir" ? { ...n, children: null } : n,
            );
            tree = updateNodeChildren(tree, path, normalized);
          } catch (_) {
            tree = updateNodeChildren(tree, path, []);
          }
        }
      }
    }
  }

  function findNode(nodes, path) {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children?.length) {
        const found = findNode(n.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  $effect(() => {
    const root = $workspaceRoot;
    const base = $fileServerUrl;
    fetchTree();
  });

  function setWorkspace(path = workspaceInput) {
    const trimmed = path?.trim() || "";
    workspaceRoot.set(trimmed);
    workspaceEditMode = false;
    if (trimmed) {
      workspaceInput = trimmed;
      addToHistory(trimmed);
    }
  }

  function startEditWorkspace() {
    workspaceEditInput = get(workspaceRoot) || "";
    workspaceEditMode = true;
  }

  function confirmEditWorkspace() {
    const trimmed = workspaceEditInput.trim();
    if (trimmed) setWorkspace(trimmed);
    else workspaceEditMode = false;
  }

  async function ejectWorkspace() {
    workspaceRoot.set("");
    repoMapText.set("");
    repoMapFileList.set([]);
    repoMapSignatures.set({});
    repoMapError.set(null);

    const convId = get(activeConversationId);
    if (convId) {
      await addMessage(convId, {
        role: "assistant",
        content: "Workspace cleared — context injection stopped.",
      });
    }
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
    // Toggle: if already open, deselect it
    if (get(editorFilePath) === absPath) {
      editorFilePath.set("");
      editorContent.set("");
      return;
    }
    try {
      let content;
      if (isTauri) {
        content = await tauriFs.readTextFile(absPath);
      } else {
        // Browser: use file-server /content endpoint
        const server = get(fileServerUrl);
        if (!server) throw new Error("File server not running");
        const res = await fetch(
          `${server}/content?path=${encodeURIComponent(absPath)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to read file");
        content = data.content;
      }
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
    : 'width: 100%; height: 100%;'} background: var(--glass-bg); border-right: {standalone
    ? '1px solid var(--glass-border)'
    : 'none'}; backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);"
>
  <div
    class="flex flex-col gap-0 p-2 border-b shrink-0"
    style="border-color: var(--ui-border);"
  >
    <!-- Section label row -->
    <div class="flex items-center justify-between pl-1 mb-2">
      <span
        class="text-[10px] font-semibold uppercase tracking-wider"
        style="color: var(--ui-text-secondary);">Workspace</span
      >
      {#if $workspaceRoot && $repoMapLoading}
        <div class="flex items-center gap-1" title="Indexing…">
          <div
            class="w-2 h-2 border border-[var(--ui-accent)] border-t-transparent rounded-full animate-spin"
          ></div>
          <span
            class="text-[9px] opacity-50"
            style="color:var(--ui-text-secondary);">Indexing…</span
          >
        </div>
      {/if}
    </div>

    {#if $workspaceRoot}
      <!-- ── ACTIVE workspace bar ── -->
      {#if workspaceEditMode}
        <!-- Inline edit mode -->
        <div class="flex items-center gap-1">
          <input
            type="text"
            class="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-xs font-mono"
            style="background: var(--ui-input-bg); border-color: var(--ui-accent); color: var(--ui-text-primary); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent) 20%, transparent);"
            bind:value={workspaceEditInput}
            placeholder="Enter absolute path…"
            onkeydown={(e) => {
              if (e.key === "Enter") confirmEditWorkspace();
              if (e.key === "Escape") workspaceEditMode = false;
            }}
            autofocus
          />
          <button
            type="button"
            class="shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
            style="background: var(--ui-accent); color: white;"
            onclick={confirmEditWorkspace}>Set</button
          >
          <button
            type="button"
            class="shrink-0 px-1.5 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5"
            style="color: var(--ui-text-secondary);"
            onclick={() => (workspaceEditMode = false)}>✕</button
          >
        </div>
      {:else}
        <!-- Normal active bar -->
        <div
          class="group flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all duration-200 cursor-default"
          style="background: var(--ui-input-bg); border-color: var(--ui-border);"
          title={$workspaceRoot}
        >
          <!-- Pulsing green dot -->
          <div
            class="w-2 h-2 rounded-full shrink-0 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse"
          ></div>
          <!-- Folder name (truncated, full path in title) -->
          <button
            class="text-xs font-bold truncate flex-1 text-left hover:text-[var(--ui-accent)] transition-colors"
            onclick={startEditWorkspace}
            title={"Click to edit: " + $workspaceRoot}
            >{$workspaceRoot.split(/[/\\]/).pop() || "/"}</button
          >
          <!-- Switch folder -->
          <button
            type="button"
            class="shrink-0 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-white/10 active:scale-95"
            style="color: var(--ui-text-secondary);"
            onclick={() => openBrowse()}
            title="Switch workspace folder"
          >
            <svg
              class="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
              />
            </svg>
          </button>
          <!-- Eject -->
          <button
            type="button"
            class="shrink-0 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-red-500/10 active:scale-95"
            style="color: var(--ui-text-secondary);"
            onclick={ejectWorkspace}
            title="Close workspace"
          >
            <svg
              class="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <!-- Full path (small, dimmed, always visible) -->
        <p
          class="text-[9px] font-mono truncate mt-1 px-1 opacity-40 select-all"
          style="color:var(--ui-text-secondary);"
          title={$workspaceRoot}
        >
          {$workspaceRoot}
        </p>
      {/if}
    {:else}
      <!-- ── NO workspace: onboarding ── -->
      <div class="flex flex-col gap-2">
        <!-- Path input -->
        <div class="flex items-center gap-1">
          <input
            id="workspace-path-input"
            type="text"
            class="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-xs font-mono"
            style="background: var(--ui-input-bg); border-color: var(--ui-border); color: var(--ui-text-primary);"
            placeholder="/home/user/my-project…"
            bind:value={workspaceInput}
            onkeydown={(e) => e.key === "Enter" && setWorkspace()}
          />
          <button
            type="button"
            class="shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40"
            style="background: var(--ui-accent); color: white;"
            onclick={() => setWorkspace()}
            disabled={!workspaceInput.trim()}>Open</button
          >
        </div>

        <!-- Browse button (prominent) -->
        <button
          type="button"
          id="workspace-browse-btn"
          class="w-full py-2.5 rounded-xl border-2 border-dashed transition-all duration-200 flex items-center justify-center gap-2 text-xs font-semibold hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] active:scale-[0.98] group"
          style="border-color: var(--ui-border); color: var(--ui-text-secondary); background: transparent;"
          onclick={() => openBrowse()}
        >
          <svg
            class="w-4 h-4 transition-transform group-hover:scale-110"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
            />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          Browse & Open Folder
        </button>

        <!-- Recent history -->
        {#if workspaceHistory.length > 0}
          <div>
            <div class="flex items-center justify-between mb-1 px-0.5">
              <span
                class="text-[9px] uppercase tracking-widest font-bold opacity-30"
                style="color:var(--ui-text-secondary);">Recent</span
              >
            </div>
            <div class="flex flex-col gap-0.5">
              {#each workspaceHistory.slice(0, 5) as hist}
                <button
                  type="button"
                  class="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_srgb,var(--ui-accent)_4%,transparent)] group"
                  style="border-color: var(--ui-border); background: var(--ui-input-bg);"
                  onclick={() => {
                    workspaceInput = hist;
                    setWorkspace(hist);
                  }}
                  title={hist}
                >
                  <svg
                    class="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                    />
                    <path d="M3 3v5h5" />
                  </svg>
                  <div class="flex flex-col min-w-0">
                    <span
                      class="text-[11px] font-semibold truncate"
                      style="color:var(--ui-text-primary);"
                      >{hist.split(/[/\\]/).pop() || "/"}</span
                    >
                    <span class="text-[9px] font-mono truncate opacity-40"
                      >{hist}</span
                    >
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- GitHub -->
    <div class="mt-3 pt-2.5 border-t" style="border-color: var(--ui-border);">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="flex-1 px-2 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
          onclick={openCloneModal}
          title="Clone GitHub repo into workspace"
        >
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
            />
          </svg>
          Clone Repo
        </button>
        {#if ($pinnedFiles || []).length > 0}
          <button
            type="button"
            class="shrink-0 px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
            onclick={unpinAll}
            title="Unpin all files">Unpin all</button
          >
        {/if}
      </div>
    </div>
  </div>

  <!-- ── BROWSE MODAL ── -->
  {#if browseModalOpen}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Choose Workspace Folder"
      onclick={() => (browseModalOpen = false)}
    >
      <div
        class="rounded-2xl shadow-2xl border w-full max-w-lg flex flex-col gap-0 max-h-[80vh] scale-in glass-modal overflow-hidden"
        onclick={(e) => e.stopPropagation()}
        style="min-height: 420px;"
      >
        <!-- Modal header -->
        <div
          class="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style="border-color: var(--ui-border);"
        >
          <h3 class="text-sm font-bold" style="color: var(--ui-text-primary);">
            Choose Workspace Folder
          </h3>
          <button
            type="button"
            class="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            style="color: var(--ui-text-secondary);"
            onclick={() => (browseModalOpen = false)}
            aria-label="Close"
          >
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Typeable path bar -->
        <div
          class="px-4 py-3 border-b shrink-0 flex items-center gap-2"
          style="border-color: var(--ui-border); background: var(--ui-input-bg);"
        >
          <button
            type="button"
            class="shrink-0 p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onclick={goUpBrowse}
            title="Go up to parent directory"
          >
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              style="color:var(--ui-text-secondary);"
            >
              <path
                d="M11 17l-5-5 5-5M18 17l-5-5 5-5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <input
            type="text"
            class="flex-1 min-w-0 text-xs font-mono rounded-lg px-2 py-1.5 border"
            style="background: transparent; border-color: transparent; color: var(--ui-text-primary); outline: none;"
            bind:value={browsePath}
            placeholder="/path/to/folder"
            title="Type a path and press Enter to navigate"
            onkeydown={(e) => {
              if (e.key === "Enter") fetchBrowseTree(browsePath);
            }}
          />
          <button
            type="button"
            class="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 hover:opacity-90"
            style="background: var(--ui-accent); color: white;"
            onclick={() => {
              workspaceInput = browsePath;
              setWorkspace(browsePath);
              browseModalOpen = false;
            }}
            title="Use this folder as workspace">Use Folder</button
          >
        </div>

        <!-- Directory listing -->
        <div class="flex-1 min-h-0 overflow-y-auto">
          {#if browseLoading}
            <div
              class="flex items-center justify-center h-32 gap-2"
              style="color:var(--ui-text-secondary);"
            >
              <div
                class="w-4 h-4 border-2 border-[var(--ui-accent)] border-t-transparent rounded-full animate-spin"
              ></div>
              <span class="text-xs animate-pulse">Scanning…</span>
            </div>
          {:else if browseError}
            <div class="p-4 text-center">
              <p class="text-xs text-red-400 mb-2">{browseError}</p>
              <p class="text-[10px] opacity-50">
                Check the path and try again.
              </p>
            </div>
          {:else if browseTree.length === 0}
            <div
              class="p-6 text-center"
              style="color:var(--ui-text-secondary);"
            >
              <svg
                class="w-8 h-8 mx-auto mb-2 opacity-20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
                />
              </svg>
              <p class="text-xs">No subfolders in this directory.</p>
            </div>
          {:else}
            <div class="flex flex-col py-1">
              {#each browseTree as node}
                <button
                  type="button"
                  class="flex items-center gap-3 px-4 py-2.5 text-xs text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ui-accent)_5%,transparent)] group border-b border-black/5 dark:border-white/5 last:border-0"
                  style="color: var(--ui-text-primary);"
                  onclick={() => fetchBrowseTree(node.path)}
                  ondblclick={() => {
                    setWorkspace(node.path);
                    browseModalOpen = false;
                  }}
                  title={"Navigate: " +
                    node.path +
                    "\nDouble-click to open as workspace"}
                >
                  <svg
                    class="w-4 h-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    style="color: var(--ui-accent);"
                  >
                    <path
                      d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
                    />
                  </svg>
                  <span class="flex-1 truncate font-medium">{node.name}</span>
                  <svg
                    class="w-3 h-3 opacity-0 group-hover:opacity-40 shrink-0 transition-opacity"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Footer hint -->
        <div
          class="px-4 py-2.5 border-t shrink-0 flex items-center justify-between"
          style="border-color:var(--ui-border); background: var(--ui-input-bg);"
        >
          <span
            class="text-[10px] opacity-40"
            style="color:var(--ui-text-secondary);"
            >Single-click to navigate · Double-click to open as workspace</span
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
        class="rounded-xl shadow-xl border p-4 w-full max-w-md glass-modal"
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

  <div
    class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5 custom-scrollbar"
  >
    {#if (get(workspaceRoot) || "").trim()}
      <!-- Search Bar -->
      <div class="px-1.5 mb-2">
        <div class="relative flex items-center group">
          <svg
            class="absolute left-2 w-3 h-3 opacity-30 group-focus-within:opacity-70 transition-opacity"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            ><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg
          >
          <input
            type="text"
            placeholder="Search files..."
            class="w-full bg-black/10 dark:bg-white/5 border border-white/5 rounded-md pl-7 pr-2 py-1 text-[11px] outline-none focus:border-white/20 transition-all font-medium"
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button
              class="absolute right-1.5 p-0.5 rounded-full hover:bg-white/10 opacity-40 hover:opacity-100"
              onclick={() => (searchQuery = "")}
            >
              <svg
                class="w-2.5 h-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"><path d="M18 6L6 18M6 6l12 12" /></svg
              >
            </button>
          {/if}
        </div>
      </div>

      <!-- Pinned Context -->
      {#if ($pinnedFiles || []).length > 0}
        <div class="mb-3 px-1.5">
          <div class="flex items-center justify-between mb-1 px-1">
            <span
              class="text-[9px] font-bold uppercase tracking-wider opacity-40"
              >Pinned Context</span
            >
            <button
              class="text-[9px] opacity-40 hover:opacity-100 transition-opacity hover:underline"
              onclick={unpinAll}>Clear all</button
            >
          </div>
          <div class="flex flex-col gap-0.5">
            {#each $pinnedFiles as path}
              <div
                class="flex items-center justify-between group px-2 py-1 rounded bg-[color-mix(in_srgb,var(--ui-accent)_5%,transparent)] border border-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)]"
              >
                <button
                  class="flex-1 text-[11px] truncate text-left hover:text-[var(--ui-accent)] transition-colors font-medium mr-2"
                  onclick={() => openFileInEditor(path)}
                  title={path}
                >
                  {path.split(/[/\\]/).pop()}
                </button>
                <button
                  class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                  onclick={() => unpin(path)}
                  title="Unpin"
                >
                  <svg
                    class="w-2.5 h-2.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg
                  >
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div
        class="px-1 mb-1 text-[9px] font-bold uppercase tracking-wider opacity-40"
      >
        Files
      </div>
    {/if}

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
        nodes={filteredTree}
        expandedDirs={forceExpandedOnSearch ? {} : expandedDirs}
        {pinnedSet}
        openFilePath={$editorFilePath}
        level={0}
        onToggleDir={toggleDir}
        onPin={pin}
        onUnpin={unpin}
        onOpenFile={openFileInEditor}
        onCopyPath={copyPath}
        {onContextMenu}
        forceExpanded={forceExpandedOnSearch}
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
      {#if !contextMenu.isFile}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--ui-accent)_15%,transparent)] border-t border-white/5"
          style="color: var(--ui-accent);"
          onclick={() => {
            workspaceInput = contextMenu.path;
            setWorkspace(contextMenu.path);
            closeContextMenu();
          }}>Set as Workspace Root</button
        >
      {/if}
    </div>
  {/if}
</div>
