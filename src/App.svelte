<script>
  import { onMount, tick } from "svelte";

  import { get } from "svelte/store";
  import { fly } from "svelte/transition";
  import { backOut, quintOut } from "svelte/easing";
  import {
    theme,
    sidebarOpen,
    settingsOpen,
    layout,
    activeConversationId,
    conversations,
    selectedModelId,
    uiTheme,
    themePickerOpen,
    cockpitIntelOpen,
    models,
    lmStudioConnected,
    cloudApisAvailable,
    activeMessages,
    isStreaming,
    messagePreparing,
    terminalOpen,
    secondaryPanelWidth,
    fileExplorerOpen,
    editorOpen,
    diffViewerState,
    workspaceRoot,
    fileServerUrl,
    terminalServerUrl,
    repoMapText,
    repoMapFileList,
    repoMapLoading,
    repoMapError,
    performanceMode,
  } from "$lib/stores.js";
  import { startTemporalController } from "$lib/temporalController.js";
  import {
    createConversation,
    listConversations,
    getMessageCount,
    getMessages,
  } from "$lib/db.js";
  import { getModels } from "$lib/api.js";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import ChatView from "$lib/components/ChatView.svelte";
  import TerminalPanel from "$lib/components/TerminalPanel.svelte";
  import EditorPanel from "$lib/components/EditorPanel.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import UiThemeSelect from "$lib/components/UiThemeSelect.svelte";
  import PresetSelect from "$lib/components/PresetSelect.svelte";
  import ModelSelector from "$lib/components/ModelSelector.svelte";
  import SettingsPanel from "$lib/components/SettingsPanel.svelte";
  import AudioManager from "$lib/components/AudioManager.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import ConvoRail from "$lib/components/ConvoRail.svelte";
  import IntelPanel from "$lib/components/IntelPanel.svelte";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import ShortcutsModal from "$lib/components/ShortcutsModal.svelte";
  import DiffViewer from "$lib/components/DiffViewer.svelte";
  import ThemePickerModal from "$lib/components/ThemePickerModal.svelte";

  import AtomLogo from "$lib/components/AtomLogo.svelte";
  import CommandCenter from "$lib/components/CommandCenter.svelte";
  import { checkLmStudioConnection } from "$lib/api.js";
  import {
    COCKPIT_LM_CHECKING,
    COCKPIT_LM_CONNECTED,
    COCKPIT_LM_UNREACHABLE,
    COCKPIT_CLOUD_APIS_AVAILABLE,
  } from "$lib/cockpitCopy.js";

  const MIN_SECONDARY_WIDTH = 250;
  const MAX_SECONDARY_WIDTH_RATIO = 0.5;
  let cockpitMainEl = $state(null);
  let secondaryDragging = $state(false);

  function onSecondaryResizeStart(e) {
    e.preventDefault();
    secondaryDragging = true;
    const startX = e.clientX;
    const startW = get(secondaryPanelWidth);
    function onMove(moveE) {
      const mainRect = cockpitMainEl?.getBoundingClientRect();
      if (!mainRect) return;
      const maxFromViewport = Math.round(
        typeof window !== "undefined"
          ? window.innerWidth * MAX_SECONDARY_WIDTH_RATIO
          : 800,
      );
      const maxW = Math.max(
        MIN_SECONDARY_WIDTH,
        Math.min(mainRect.width - 200, maxFromViewport),
      );
      const delta = startX - moveE.clientX; // Because it's on the right, moving left increases width
      const next = Math.round(
        Math.max(MIN_SECONDARY_WIDTH, Math.min(maxW, startW + delta)),
      );
      secondaryPanelWidth.set(next);
    }
    function onUp() {
      secondaryDragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const MIN_TERMINAL_HEIGHT = 100;
  let terminalHeight = $state(250);
  let verticalDragging = $state(false);

  function onVerticalResizeStart(e) {
    e.preventDefault();
    verticalDragging = true;
    const startY = e.clientY;
    const startH = terminalHeight;
    function onMove(moveE) {
      const delta = startY - moveE.clientY;
      const next = Math.max(MIN_TERMINAL_HEIGHT, startH + delta);
      terminalHeight = next;
    }
    function onUp() {
      verticalDragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const HEADER_MODEL_MIN = "min-width: 22rem;";
  const HEADER_PRESET_MIN = "min-width: 7rem;";
  const HEADER_THEME_MIN = "min-width: 10rem;";
  const HEADER_GROUP_GAP = "gap: var(--space-3);";
  const HEADER_BETWEEN_GROUPS = "var(--space-5)";
  const HEADER_RIGHT_GROUP = "margin-left: auto;";

  let lmStatusMessage = $state("");

  // Phase 9A/Phase 2: Index workspace when root or file server changes
  $effect(() => {
    const root = $workspaceRoot?.trim();
    const base = $fileServerUrl;
    if (!root) {
      repoMapText.set("");
      repoMapFileList.set([]);
      repoMapError.set(null);
      return;
    }
    let cancelled = false;
    repoMapLoading.set(true);
    repoMapError.set(null);
    import("$lib/repoMap.js").then(({ buildRepoMapText }) => {
      buildRepoMapText(root, base)
        .then((text) => {
          if (cancelled) return;
          repoMapText.set(text || "");
          repoMapError.set(null);
          repoMapLoading.set(false);
        })
        .catch((e) => {
          if (cancelled) return;
          repoMapText.set("");
          repoMapError.set(e?.message || "Failed to index project");
          repoMapLoading.set(false);
        });
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const c = $lmStudioConnected;
    const cloud = $cloudApisAvailable;
    if (c === true) lmStatusMessage = COCKPIT_LM_CONNECTED;
    else if (c === false && cloud)
      lmStatusMessage = COCKPIT_CLOUD_APIS_AVAILABLE;
    else if (c === false) lmStatusMessage = COCKPIT_LM_UNREACHABLE;
    else lmStatusMessage = COCKPIT_LM_CHECKING;
  });

  function getResolvedUiTheme() {
    const u = get(uiTheme);
    const t = get(theme);

    // Custom themes (ollama, perplexity, trek) are returned as-is.
    // Standard themes (light, dark, coder) may need system resolution.
    const isStandard = ["light", "dark", "coder"].includes(u);
    if (!isStandard) return u;

    if (t === "system" && typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return t === "dark" ? "dark" : "light";
  }
  function applyResolvedTheme() {
    const u = get(uiTheme); // e.g. "light", "dark", "coder", "ollama", "perplexity", "trek"
    const t = get(theme); // "light", "dark", or "system"

    // Determine which UI theme palette to apply
    const isStandard = ["light", "dark", "coder"].includes(u);
    let uiThemeName = u;
    if (isStandard) {
      if (u === "coder") {
        uiThemeName = "coder";
      } else if (t === "system" && typeof window !== "undefined") {
        uiThemeName = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      } else {
        uiThemeName = t === "dark" ? "dark" : "light";
      }
    }

    // Determine dark/light mode separately (for .dark class and glassmorphism)
    let isDark;
    if (t === "system" && typeof window !== "undefined") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else if (t === "dark") {
      isDark = true;
    } else if (t === "light") {
      isDark = false;
    } else {
      // Fallback: standard themes use their own value
      isDark = uiThemeName !== "light";
    }

    if (typeof document !== "undefined") {
      document.documentElement.dataset.uiTheme = uiThemeName;
      document.documentElement.classList.toggle("dark", isDark);
    }
  }
  onMount(() => {
    applyResolvedTheme();
    const unsubTheme = theme.subscribe(() => applyResolvedTheme());
    const unsubUi = uiTheme.subscribe(() => applyResolvedTheme());
    const mq =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", () => applyResolvedTheme());

    // ── Clean shutdown on tab/window close ──────────────
    function handleBeforeUnload() {
      // Signal both backend servers to shut down
      // sendBeacon is fire-and-forget, works reliably on tab close
      const fsUrl = get(fileServerUrl) || "http://localhost:8768";
      const tsUrl = (get(terminalServerUrl) || "ws://localhost:8767").replace(
        /^ws/,
        "http",
      ); // convert ws:// to http://
      try {
        navigator.sendBeacon(`${fsUrl}/shutdown`, "");
      } catch (_) {}
      try {
        navigator.sendBeacon(`${tsUrl}/shutdown`, "");
      } catch (_) {}
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      unsubTheme();
      unsubUi();
      mq?.removeEventListener?.("change", () => applyResolvedTheme());
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  });
  theme.subscribe((v) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("theme", v);
  });
  uiTheme.subscribe((v) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("uiTheme", v);
  });
  layout.subscribe((v) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("layout", v);
  });
  onMount(() => applyResolvedTheme());

  isStreaming.subscribe((streaming) => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("is-streaming", !!streaming);
    }
  });
  onMount(() => {
    document.body.classList.toggle("is-streaming", !!get(isStreaming));
  });

  performanceMode.subscribe((v) => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("performance-mode", !!v);
    }
  });

  onMount(() => {
    const stopTemporal = startTemporalController(activeMessages, uiTheme);
    return () => {
      stopTemporal();
    };
  });

  onMount(() => {
    function onKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        terminalOpen.update((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        fileExplorerOpen.update((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });

  onMount(() => {
    let pollId;
    const POLL_MS = 30000; // 30s when visible – avoid pinging LM Studio too often so idle unload can run
    const POLL_MS_HIDDEN = 60000; // 60s when tab hidden
    async function pollConnection() {
      lmStudioConnected.set(await checkLmStudioConnection());
      const interval =
        typeof document !== "undefined" && document.visibilityState === "hidden"
          ? POLL_MS_HIDDEN
          : POLL_MS;
      pollId = setTimeout(pollConnection, interval);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        clearTimeout(pollId);
        pollConnection();
      }
    }
    pollConnection();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  onMount(async () => {
    let list = await listConversations();
    if (list.length === 0) {
      const id = await createConversation();
      activeConversationId.set(id);
      list = await listConversations();
    }
    list = await Promise.all(
      list.map(async (c) => ({
        ...c,
        messageCount: await getMessageCount(c.id),
      })),
    );
    conversations.set(list);
    if (!get(activeConversationId) && list.length > 0)
      activeConversationId.set(list[0].id);

    try {
      const modelList = await getModels();
      models.set(modelList.map((m) => ({ id: m.id })));
    } catch (_) {
      // LM Studio may not be running; selectors will refetch when opened
    }
  });

  async function refreshConversations() {
    let list = await listConversations();
    list = await Promise.all(
      list.map(async (c) => ({
        ...c,
        messageCount: await getMessageCount(c.id),
      })),
    );
    conversations.set(list);
  }

  async function newChat() {
    const id = await createConversation();
    await refreshConversations();
    activeConversationId.set(id);
  }

  let intelTabBounce = $state(false);
  function toggleIntel() {
    cockpitIntelOpen.update((v) => !v);
    intelTabBounce = true;
    setTimeout(() => (intelTabBounce = false), 420);
  }
</script>

<div
  class="h-screen w-full min-w-0 overflow-hidden"
  style="position: relative; z-index: 1; background-color: var(--ui-bg-main); max-width: 100vw; box-sizing: border-box;"
>
  <AudioManager />
  <CommandPalette />
  <ConfirmModal />
  <ShortcutsModal />
  <ThemePickerModal />
  {#if $diffViewerState}
    <DiffViewer
      originalCode={$diffViewerState.originalCode}
      modifiedCode={$diffViewerState.modifiedCode}
      filePath={$diffViewerState.filePath}
      onclose={() => diffViewerState.set(null)}
      onapply={() => diffViewerState.set(null)}
    />
  {/if}

  {#if $layout === "cockpit"}
    <div class="flex h-full flex-col min-w-0 overflow-hidden">
      <CommandCenter />
      <div
        class="flex flex-1 min-h-0 min-w-0 overflow-hidden relative cockpit-main-row"
      >
        <ConvoRail />
        <main
          class="flex-1 flex flex-row min-w-0 min-h-0 cockpit-main"
          style="background-color: var(--ui-bg-main);"
          bind:this={cockpitMainEl}
        >
          <div class="flex-1 min-w-0 overflow-hidden flex flex-col relative">
            <ChatView />
          </div>
          {#if $editorOpen || $terminalOpen}
            <div
              class="right-panel-resize-handle shrink-0 flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style="width: 6px; min-width: 6px; cursor: col-resize; background: var(--ui-bg-sidebar); border-left: 1px solid var(--ui-border);"
              role="separator"
              aria-label="Resize side panel"
              aria-orientation="vertical"
              tabindex="-1"
              onmousedown={onSecondaryResizeStart}
            >
              <span
                class="resize-handle-line-v flex flex-col gap-[2px] items-center justify-center opacity-40 hover:opacity-100 transition-opacity"
                aria-hidden="true"
                style="width: 2px; height: 12px;"
              >
                <div
                  class="w-full bg-current rounded-full"
                  style="height: 2px; color: var(--ui-text-secondary);"
                ></div>
                <div
                  class="w-full bg-current rounded-full"
                  style="height: 2px; color: var(--ui-text-secondary);"
                ></div>
                <div
                  class="w-full bg-current rounded-full"
                  style="height: 2px; color: var(--ui-text-secondary);"
                ></div>
              </span>
            </div>
            <div
              class="secondary-slot shrink-0 overflow-hidden flex flex-col border-l"
              style="width: {$secondaryPanelWidth}px; min-width: {MIN_SECONDARY_WIDTH}px; border-color: var(--ui-border);"
            >
              {#if $editorOpen}
                <div
                  class="flex-1 min-h-0 min-w-0 overflow-hidden relative"
                  style="z-index: 0; background-color: var(--ui-bg-main);"
                >
                  <EditorPanel />
                </div>
              {/if}
              {#if $editorOpen && $terminalOpen}
                <div
                  class="horizontal-resize-handle shrink-0 flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style="height: 6px; min-height: 6px; cursor: row-resize; background: var(--ui-bg-sidebar); border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border);"
                  role="separator"
                  aria-label="Resize vertical panels"
                  aria-orientation="horizontal"
                  tabindex="-1"
                  onmousedown={onVerticalResizeStart}
                >
                  <span
                    class="resize-handle-line-h flex gap-[2px] items-center justify-center opacity-40 hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                    style="height: 2px; width: 12px;"
                  >
                    <div
                      class="h-full bg-current rounded-full"
                      style="width: 2px; color: var(--ui-text-secondary);"
                    ></div>
                    <div
                      class="h-full bg-current rounded-full"
                      style="width: 2px; color: var(--ui-text-secondary);"
                    ></div>
                    <div
                      class="h-full bg-current rounded-full"
                      style="width: 2px; color: var(--ui-text-secondary);"
                    ></div>
                  </span>
                </div>
              {/if}
              {#if $terminalOpen}
                <div
                  class="shrink-0 min-h-0 min-w-0 overflow-hidden relative"
                  style="z-index: 0; background-color: var(--ui-bg-main); height: {$editorOpen
                    ? terminalHeight + 'px'
                    : '100%'};"
                >
                  <TerminalPanel />
                </div>
              {/if}
            </div>
          {:else}
            <div
              class="terminal-closed-bar flex flex-col items-center justify-center p-1 border-l hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style="background: color-mix(in srgb, var(--ui-bg-sidebar) 70%, var(--ui-bg-main)); border-color: var(--ui-border); writing-mode: vertical-rl; transform: rotate(180deg);"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors w-full h-full cursor-pointer"
                style="color: var(--ui-text-secondary);"
                onclick={() => terminalOpen.set(true)}
                title="Open terminal & editor (Ctrl+`)"
                aria-label="Open terminal and editor"
              >
                <span aria-hidden="true" style="transform: rotate(90deg);"
                  >▶</span
                >
                <span>Terminal & Editor</span>
              </button>
            </div>
          {/if}
        </main>
        {#if $cockpitIntelOpen}
          <aside
            class="w-[280px] shrink-0 border-l overflow-visible flex flex-col relative"
            style="border-color: var(--ui-border);"
            in:fly={{ x: 280, duration: 400, easing: backOut }}
            out:fly={{ x: 280, duration: 300, easing: quintOut }}
          >
            <button
              type="button"
              class="panel-tab {intelTabBounce ? 'panel-tab-bounce' : ''}"
              style="--panel-tab-transform: translate(-100%, -50%); left: 0; top: 50%; border-right: none; border-radius: var(--ui-radius) 0 0 var(--ui-radius);"
              title="Close Intel panel"
              aria-label="Close Intel panel"
              onclick={toggleIntel}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg
              >
            </button>
            <div class="flex-1 overflow-hidden flex flex-col min-h-0 pl-6">
              <IntelPanel />
            </div>
          </aside>
        {:else}
          <!-- Visible strip so the open tab is never clipped (root has overflow-hidden) -->
          <div
            class="intel-tab-strip shrink-0 w-7 flex items-center justify-center relative min-h-0 border-l"
            style="background-color: var(--ui-bg-sidebar); border-color: var(--ui-border);"
          >
            <button
              type="button"
              class="panel-tab {intelTabBounce ? 'panel-tab-bounce' : ''}"
              style="--panel-tab-transform: translateY(-50%); left: 0; top: 50%; border-right: none; border-radius: var(--ui-radius) 0 0 var(--ui-radius);"
              title="Open Intel panel"
              aria-label="Open Intel panel"
              onclick={toggleIntel}
            >
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"><path d="M15 19l-7-7 7-7" /></svg
              >
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if $settingsOpen}
    <SettingsPanel onclose={() => settingsOpen.set(false)} />
  {/if}
</div>

<style>
</style>
