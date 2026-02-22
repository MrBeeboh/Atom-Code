<script>
  import { onMount, tick } from 'svelte';

  import { get } from 'svelte/store';
  import { fly } from 'svelte/transition';
  import { backOut, quintOut } from 'svelte/easing';
  import { theme, sidebarOpen, settingsOpen, layout, activeConversationId, conversations, selectedModelId, uiTheme, cockpitIntelOpen, models, lmStudioConnected, cloudApisAvailable, activeMessages, isStreaming, messagePreparing, terminalOpen, terminalHeight, fileExplorerOpen, editorOpen, diffViewerState, workspaceRoot, fileServerUrl, repoMapText, repoMapFileList, repoMapLoading, repoMapError } from '$lib/stores.js';
import { getRepoMap } from '$lib/repoMap.js';
  import { startTemporalController } from '$lib/temporalController.js';
  import { createConversation, listConversations, getMessageCount, getMessages } from '$lib/db.js';
  import { getModels } from '$lib/api.js';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ChatView from '$lib/components/ChatView.svelte';
  import FileExplorer from '$lib/components/FileExplorer.svelte';
  import TerminalPanel from '$lib/components/TerminalPanel.svelte';
  import EditorPanel from '$lib/components/EditorPanel.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
import UiThemeSelect from '$lib/components/UiThemeSelect.svelte';
  import PresetSelect from '$lib/components/PresetSelect.svelte';
  import ModelSelector from '$lib/components/ModelSelector.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import AudioManager from '$lib/components/AudioManager.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ConvoRail from '$lib/components/ConvoRail.svelte';
  import IntelPanel from '$lib/components/IntelPanel.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import ShortcutsModal from '$lib/components/ShortcutsModal.svelte';
  import DiffViewer from '$lib/components/DiffViewer.svelte';
  import LabDiagnosticsOverlay from '$lib/components/LabDiagnosticsOverlay.svelte';
  import AtomLogo from '$lib/components/AtomLogo.svelte';
  import { checkLmStudioConnection } from '$lib/api.js';
  import { COCKPIT_LM_CHECKING, COCKPIT_LM_CONNECTED, COCKPIT_LM_UNREACHABLE, COCKPIT_CLOUD_APIS_AVAILABLE } from '$lib/cockpitCopy.js';

  const MIN_TERMINAL_HEIGHT = 150;
  const MAX_TERMINAL_HEIGHT_RATIO = 0.7;
  let cockpitMainEl = $state(null);
  let terminalDragging = $state(false);

  function onTerminalResizeStart(e) {
    e.preventDefault();
    terminalDragging = true;
    const startY = e.clientY;
    const startH = get(terminalHeight);
    function onMove(moveE) {
      const mainRect = cockpitMainEl?.getBoundingClientRect();
      if (!mainRect) return;
      const maxFromViewport = Math.round(typeof window !== 'undefined' ? window.innerHeight * MAX_TERMINAL_HEIGHT_RATIO : 600);
      const maxH = Math.max(MIN_TERMINAL_HEIGHT, Math.min(mainRect.height - 80, maxFromViewport));
      const delta = startY - moveE.clientY;
      const next = Math.round(Math.max(MIN_TERMINAL_HEIGHT, Math.min(maxH, startH + delta)));
      terminalHeight.set(next);
    }
    function onUp() {
      terminalDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const HEADER_MODEL_MIN = 'min-width: 22rem;';
  const HEADER_PRESET_MIN = 'min-width: 7rem;';
  const HEADER_THEME_MIN = 'min-width: 10rem;';
  const HEADER_GROUP_GAP = 'gap: var(--space-3);';
  const HEADER_BETWEEN_GROUPS = 'var(--space-5)';
  const HEADER_RIGHT_GROUP = 'margin-left: auto;';

  let lmStatusMessage = $state('');

  // Phase 9A: Index workspace when root or file server changes
  $effect(() => {
    const root = $workspaceRoot?.trim();
    const base = $fileServerUrl;
    if (!root) {
      repoMapText.set('');
      repoMapFileList.set([]);
      repoMapError.set(null);
      return;
    }
    let cancelled = false;
    repoMapLoading.set(true);
    repoMapError.set(null);
    getRepoMap(root, base)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          repoMapText.set(result.text);
          repoMapFileList.set(result.fileList);
        } else {
          repoMapText.set('');
          repoMapFileList.set([]);
        }
        repoMapError.set(null);
      })
      .catch((e) => {
        if (!cancelled) {
          repoMapError.set(e?.message || 'Failed to index project');
          repoMapText.set('');
          repoMapFileList.set([]);
        }
      })
      .finally(() => {
        if (!cancelled) repoMapLoading.set(false);
      });
    return () => { cancelled = true; };
  });

  $effect(() => {
    if ($editorOpen && !$terminalOpen) terminalOpen.set(true);
  });

  $effect(() => {
    const c = $lmStudioConnected;
    const cloud = $cloudApisAvailable;
    if (c === true) lmStatusMessage = COCKPIT_LM_CONNECTED;
    else if (c === false && cloud) lmStatusMessage = COCKPIT_CLOUD_APIS_AVAILABLE;
    else if (c === false) lmStatusMessage = COCKPIT_LM_UNREACHABLE;
    else lmStatusMessage = COCKPIT_LM_CHECKING;
  });

  function getResolvedUiTheme() {
    const u = get(uiTheme);
    const t = get(theme);
    if (u === 'coder') return 'coder';
    if (t === 'system' && typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return t === 'dark' ? 'dark' : 'light';
  }
  function applyResolvedTheme() {
    const resolved = getResolvedUiTheme();
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.uiTheme = resolved;
      document.documentElement.classList.toggle('dark', resolved !== 'light');
    }
  }
  onMount(() => {
    applyResolvedTheme();
    const unsubTheme = theme.subscribe(() => applyResolvedTheme());
    const unsubUi = uiTheme.subscribe(() => applyResolvedTheme());
    const mq = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', () => applyResolvedTheme());
    return () => {
      unsubTheme();
      unsubUi();
      mq?.removeEventListener?.('change', () => applyResolvedTheme());
    };
  });
  theme.subscribe((v) => { if (typeof localStorage !== 'undefined') localStorage.setItem('theme', v); });
  uiTheme.subscribe((v) => { if (typeof localStorage !== 'undefined') localStorage.setItem('uiTheme', v); });
  layout.subscribe((v) => { if (typeof localStorage !== 'undefined') localStorage.setItem('layout', v); });
  onMount(() => applyResolvedTheme());

  isStreaming.subscribe((streaming) => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('is-streaming', !!streaming);
    }
  });
  onMount(() => { document.body.classList.toggle('is-streaming', !!get(isStreaming)); });

  onMount(() => {
    const stopTemporal = startTemporalController(activeMessages, uiTheme);
    return () => { stopTemporal(); };
  });

  onMount(() => {
    function onKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        terminalOpen.update((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (get(terminalOpen)) {
          editorOpen.update((v) => !v);
        } else {
          terminalOpen.set(true);
          editorOpen.set(true);
        }
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });

  onMount(() => {
    let pollId;
    const POLL_MS = 30000; // 30s when visible – avoid pinging LM Studio too often so idle unload can run
    const POLL_MS_HIDDEN = 60000; // 60s when tab hidden
    async function pollConnection() {
      lmStudioConnected.set(await checkLmStudioConnection());
      const interval = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? POLL_MS_HIDDEN : POLL_MS;
      pollId = setTimeout(pollConnection, interval);
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        clearTimeout(pollId);
        pollConnection();
      }
    }
    pollConnection();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimeout(pollId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });

  onMount(async () => {
    let list = await listConversations();
    if (list.length === 0) {
      const id = await createConversation();
      activeConversationId.set(id);
      list = await listConversations();
    }
    list = await Promise.all(list.map(async (c) => ({ ...c, messageCount: await getMessageCount(c.id) })));
    conversations.set(list);
    if (!get(activeConversationId) && list.length > 0) activeConversationId.set(list[0].id);

    try {
      const modelList = await getModels();
      models.set(modelList.map((m) => ({ id: m.id })));
    } catch (_) {
      // LM Studio may not be running; selectors will refetch when opened
    }
  });

  async function refreshConversations() {
    let list = await listConversations();
    list = await Promise.all(list.map(async (c) => ({ ...c, messageCount: await getMessageCount(c.id) })));
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
  {#if $diffViewerState}
    <DiffViewer
      originalCode={$diffViewerState.originalCode}
      modifiedCode={$diffViewerState.modifiedCode}
      filePath={$diffViewerState.filePath}
      onclose={() => diffViewerState.set(null)}
      onapply={() => diffViewerState.set(null)}
    />
  {/if}

  {#if $layout === 'cockpit'}
    <div class="flex h-full flex-col min-w-0 overflow-hidden">
      <!-- Cockpit header: 3-zone layout — left (brand+layout), center (model+preset), right (theme+status) -->
      <header class="cockpit-header shrink-0 flex items-center px-4 py-2.5 border-b" style="border-color: var(--ui-border); background-color: var(--ui-bg-sidebar);">
        <!-- Left: brand -->
        <div class="flex items-center gap-2 shrink-0" role="group" aria-label="Brand">
          <span class="flex items-center gap-1.5 font-semibold shrink-0" style="color: var(--ui-accent);"><AtomLogo size={20} animated={$messagePreparing || $isStreaming} />ATOM Code</span>
        </div>
        <!-- Center: model selector + preset — horizontally centered, no extra background -->
        <div class="flex-1 flex items-center justify-center min-w-0 px-4">
          <div class="flex items-center gap-2 min-w-0" role="group" aria-label="Model and preset">
            <div class="min-w-0" style="{HEADER_MODEL_MIN}"><ModelSelector /></div>
            <div class="shrink-0" style="{HEADER_PRESET_MIN}"><PresetSelect compact={true} /></div>
          </div>
        </div>
        <!-- Right: theme (Light/Dark/Coder) + Auto toggle + status -->
        <div class="flex items-center gap-3 shrink-0">
          <div class="flex items-center shrink-0 gap-2" role="group" aria-label="Theme">
            <UiThemeSelect compact={true} />
            <ThemeToggle />
          </div>
          <div class="flex items-center gap-1.5 shrink-0 pr-1" role="group" aria-label="Status">
            <span class="w-2 h-2 rounded-full shrink-0" style="background-color: {$lmStudioConnected === true ? '#22c55e' : $lmStudioConnected === false ? ($cloudApisAvailable ? '#3b82f6' : '#ef4444') : '#94a3b8'};" aria-hidden="true"></span>
            <span class="text-xs font-medium shrink-0" style="color: var(--ui-text-primary);" title={lmStatusMessage} aria-label={lmStatusMessage}>
              <span class="hidden sm:inline">{lmStatusMessage}</span>
            </span>
          </div>
        </div>
      </header>
      <div class="flex flex-1 min-h-0 min-w-0 overflow-hidden relative cockpit-main-row">
        {#if $fileExplorerOpen}
          <FileExplorer />
        {/if}
        <ConvoRail />
        <main
          class="flex-1 flex flex-col min-w-0 min-h-0 cockpit-main"
          style="background-color: var(--ui-bg-main);"
          bind:this={cockpitMainEl}
        >
          <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ChatView />
          </div>
          {#if $terminalOpen}
            <div
              class="bottom-panel-resize-handle shrink-0 flex items-center justify-center transition-colors"
              style="height: 6px; min-height: 6px; cursor: row-resize; background: var(--ui-bg-sidebar); border-top: 1px solid var(--ui-border);"
              role="separator"
              aria-label="Resize bottom panel"
              onmousedown={onTerminalResizeStart}
            >
              <span class="resize-handle-line" aria-hidden="true"></span>
            </div>
            <div
              class="terminal-slot shrink-0 overflow-hidden flex flex-col"
              style="height: {$terminalHeight}px; min-height: {MIN_TERMINAL_HEIGHT}px;"
            >
              <div class="bottom-panel-tabs shrink-0 flex items-center gap-0 border-b" style="height: 32px; min-height: 32px; border-color: var(--ui-border); background: var(--ui-bg-sidebar); padding: 0 0.25rem;">
                <button
                  type="button"
                  class="bottom-panel-tab px-3 text-xs font-medium transition-colors rounded-t"
                  style="color: {$editorOpen ? 'var(--ui-text-secondary)' : 'var(--ui-text-primary)'}; border-bottom: 2px solid {$editorOpen ? 'transparent' : 'var(--ui-accent)'}; background: {$editorOpen ? 'transparent' : 'color-mix(in srgb, var(--ui-accent) 12%, transparent)'};"
                  title="Switch to terminal"
                  aria-label="Switch to terminal"
                  onclick={() => editorOpen.set(false)}
                >Terminal</button>
                <button
                  type="button"
                  class="bottom-panel-tab px-3 text-xs font-medium transition-colors rounded-t"
                  style="color: {$editorOpen ? 'var(--ui-text-primary)' : 'var(--ui-text-secondary)'}; border-bottom: 2px solid {$editorOpen ? 'var(--ui-accent)' : 'transparent'}; background: {$editorOpen ? 'color-mix(in srgb, var(--ui-accent) 12%, transparent)' : 'transparent'};"
                  title="Switch to editor (Ctrl+E)"
                  aria-label="Switch to editor"
                  onclick={() => { editorOpen.set(true); terminalOpen.set(true); }}
                >Editor</button>
              </div>
              <div class="flex-1 min-h-0 overflow-hidden relative" style="z-index: 0;">
                {#if $editorOpen}
                  <EditorPanel />
                {:else}
                  <TerminalPanel />
                {/if}
              </div>
            </div>
          {:else}
            <div
              class="terminal-closed-bar shrink-0 flex items-center justify-center py-1.5 border-t"
              style="background: color-mix(in srgb, var(--ui-bg-sidebar) 70%, var(--ui-bg-main)); border-color: var(--ui-border);"
            >
              <button
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style="color: var(--ui-text-secondary);"
                title="Open terminal & editor (Ctrl+`)"
                aria-label="Open terminal and editor"
                onclick={() => terminalOpen.set(true)}
              >
                <span aria-hidden="true">▶</span>
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
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <div class="flex-1 overflow-hidden flex flex-col min-h-0 pl-6">
              <IntelPanel />
            </div>
          </aside>
        {:else}
          <!-- Visible strip so the open tab is never clipped (root has overflow-hidden) -->
          <div class="intel-tab-strip shrink-0 w-7 flex items-center justify-center relative min-h-0 border-l" style="background-color: var(--ui-bg-sidebar); border-color: var(--ui-border);">
            <button
              type="button"
              class="panel-tab {intelTabBounce ? 'panel-tab-bounce' : ''}"
              style="--panel-tab-transform: translateY(-50%); left: 0; top: 50%; border-right: none; border-radius: var(--ui-radius) 0 0 var(--ui-radius);"
              title="Open Intel panel"
              aria-label="Open Intel panel"
              onclick={toggleIntel}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if $settingsOpen}
    <SettingsPanel onclose={() => settingsOpen.set(false)} />
  {/if}
  <LabDiagnosticsOverlay />
</div>

<style>
  .bottom-panel-tab:hover {
    color: var(--ui-text-primary);
    background: color-mix(in srgb, var(--ui-accent) 8%, transparent) !important;
  }
  .bottom-panel-resize-handle:hover {
    background: color-mix(in srgb, var(--ui-accent) 12%, var(--ui-bg-sidebar));
  }
  .bottom-panel-resize-handle:hover .resize-handle-line {
    background: var(--ui-accent);
    height: 2px;
  }
  .resize-handle-line {
    width: 48px;
    height: 1px;
    background: var(--ui-text-secondary);
    opacity: 0.6;
    border-radius: 1px;
    transition: height 0.15s, background 0.15s;
  }
</style>
