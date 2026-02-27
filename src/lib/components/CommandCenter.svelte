<script>
    import { get } from "svelte/store";
    import {
        workspaceRoot,
        liveTokPerSec,
        themeMetrics,
        editorFilePath,
        messagePreparing,
        isStreaming,
        lmStudioConnected,
        cloudApisAvailable,
        fileServerUrl,
        ttsEnabled,
        ttsPlaying,
    } from "$lib/stores.js";
    import { stopTTS } from "$lib/tts.js";
    import { buildRepoMapText, repoMapText } from "$lib/repoMap.js";
    import AtomLogo from "./AtomLogo.svelte";
    import ModelSelector from "./ModelSelector.svelte";
    import PresetSelect from "./PresetSelect.svelte";
    import UiThemeSelect from "./UiThemeSelect.svelte";
    import ThemeToggle from "./ThemeToggle.svelte";
    import {
        COCKPIT_LM_CHECKING,
        COCKPIT_LM_CONNECTED,
        COCKPIT_LM_UNREACHABLE,
        COCKPIT_CLOUD_APIS_AVAILABLE,
    } from "$lib/cockpitCopy.js";

    const breadcrumbs = $derived.by(() => {
        const root = $workspaceRoot;
        const file = $editorFilePath;
        if (!root || !file) return [];

        const relative = file.replace(root, "").replace(/^[/\\]+/, "");
        const parts = relative.split(/[/\\]/);
        return parts.filter(Boolean);
    });

    let lmStatusMessage = $state("");
    let isRefreshing = $state(false);
    let showCheckmark = $state(false);

    async function refreshContext() {
        if (!$workspaceRoot?.trim() || isRefreshing) return;
        isRefreshing = true;
        try {
            const text = await buildRepoMapText(
                $workspaceRoot.trim(),
                $fileServerUrl,
            );
            repoMapText.set(text || "");
            showCheckmark = true;
            setTimeout(() => (showCheckmark = false), 1500);
        } catch (e) {
            console.error("Refresh context failed:", e);
        } finally {
            isRefreshing = false;
        }
    }

    $effect(() => {
        const c = $lmStudioConnected;
        const cloud = $cloudApisAvailable;
        if (c === true) lmStatusMessage = COCKPIT_LM_CONNECTED;
        else if (c === false && cloud)
            lmStatusMessage = COCKPIT_CLOUD_APIS_AVAILABLE;
        else if (c === false) lmStatusMessage = COCKPIT_LM_UNREACHABLE;
        else lmStatusMessage = COCKPIT_LM_CHECKING;
    });

    const workspaceName = $derived(
        $workspaceRoot
            ? $workspaceRoot.split(/[/\\]/).filter(Boolean).pop()
            : null,
    );
</script>

<header
    class="h-11 shrink-0 flex items-center justify-between px-4 border-b z-30"
    style="background: var(--glass-bg); border-bottom: 1px solid var(--glass-border); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);"
>
    <!-- Left: Brand & Breadcrumbs -->
    <div
        class="flex items-center gap-2 lg:gap-3 overflow-hidden pr-2 lg:pr-4 min-w-0 flex-shrink"
    >
        <div class="flex items-center gap-2 shrink-0">
            <span
                class="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider shrink-0"
                style="color: var(--ui-accent);"
                ><AtomLogo
                    size={16}
                    animated={$messagePreparing || $isStreaming}
                />ATOM</span
            >
        </div>

        {#if workspaceName}
            <div
                class="flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-tight uppercase group relative cursor-help"
                style="background: color-mix(in srgb, var(--ui-accent) 10%, transparent); border-color: color-mix(in srgb, var(--ui-accent) 20%, transparent); color: var(--ui-accent); opacity: 0.9;"
                title={$workspaceRoot}
            >
                <svg
                    class="w-3 h-3 mr-1 opacity-70"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path
                        d="M4 19.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V8.5L14.5 3H6.5A2.5 2.5 0 0 0 4 5.5z"
                    /><polyline points="14 3 14 9 20 9" /></svg
                >
                {workspaceName}
            </div>
        {/if}

        <div class="h-4 w-[1px] bg-white/10 mx-1 shrink-0"></div>

        <div class="flex items-center gap-1 text-[11px] truncate min-w-0">
            {#each breadcrumbs as part, i}
                <span class="opacity-30">/</span>
                <span
                    class={i === breadcrumbs.length - 1
                        ? "font-bold"
                        : "opacity-60"}
                >
                    {part}
                </span>
            {/each}
            {#if breadcrumbs.length === 0}
                <span class="opacity-20 italic">No file selected</span>
            {/if}
        </div>

        <button
            class="flex items-center justify-center w-7 h-7 rounded hover:bg-white/5 opacity-50 hover:opacity-100 transition-all shrink-0 ml-1"
            title="Refresh Context"
            onclick={refreshContext}
            disabled={isRefreshing}
        >
            {#if showCheckmark}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22c55e"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><polyline points="20 6 9 17 4 12"></polyline></svg
                >
            {:else if isRefreshing}
                <svg
                    class="animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
                    ></path><path d="M21 3v5h-5"></path></svg
                >
            {:else}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
                    ></path><path d="M21 3v5h-5"></path></svg
                >
            {/if}
        </button>
    </div>

    <!-- Center: Model & Preset -->
    <div
        class="flex-1 flex items-center justify-center min-w-0 px-2 lg:px-4 overflow-hidden"
    >
        <div
            class="flex items-center gap-2 min-w-0 max-w-full"
            role="group"
            aria-label="Model and preset"
        >
            <div class="shrink-0">
                <PresetSelect compact={true} />
            </div>
            <div
                class="min-w-0 max-w-[12rem] md:max-w-[18rem] lg:max-w-[24rem]"
            >
                <ModelSelector />
            </div>
        </div>
    </div>

    <!-- Right: Stats & Theme -->
    <div class="flex items-center gap-2 lg:gap-4 shrink-0 pl-2 lg:pl-4">
        <!-- Stats Tray -->
        <div
            class="hidden md:flex items-center gap-3 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-white/5"
        >
            {#if $liveTokPerSec != null}
                <div
                    class="flex items-center gap-1.5"
                    title="Tokens per second"
                >
                    <div
                        class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
                    ></div>
                    <span
                        class="text-[10px] font-mono font-bold opacity-80"
                        style="color: var(--ui-text-primary);"
                    >
                        {$liveTokPerSec.toFixed(1)}
                        <small class="opacity-40">T/S</small>
                    </span>
                </div>
            {/if}

            {#if $themeMetrics.lastLatencyMs != null}
                <div class="flex items-center gap-1.5" title="Latency">
                    <span
                        class="text-[10px] font-mono font-bold opacity-80"
                        style="color: var(--ui-text-primary);"
                    >
                        {$themeMetrics.lastLatencyMs}
                        <small class="opacity-40">MS</small>
                    </span>
                </div>
            {/if}
        </div>

        <div class="h-4 w-[1px] bg-white/10 mx-1 shrink-0"></div>

        <!-- Controls -->
        <div class="flex items-center gap-2">
            <UiThemeSelect compact={true} />
            <ThemeToggle />

            <div class="h-4 w-[1px] bg-white/10 mx-1 shrink-0"></div>

            <!-- TTS Controls -->
            <div
                class="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-full px-1 py-0.5 border border-white/5"
            >
                <button
                    class="w-7 h-7 flex items-center justify-center rounded-full transition-all"
                    style="color: {$ttsEnabled
                        ? 'var(--atom-teal)'
                        : 'currentColor'}; opacity: {$ttsEnabled
                        ? '1'
                        : '0.4'};"
                    title={$ttsEnabled ? "Disable TTS" : "Enable TTS"}
                    onclick={() => ttsEnabled.set(!$ttsEnabled)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
                        ></polygon>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                </button>

                {#if $ttsPlaying}
                    <button
                        class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-500 transition-colors"
                        title="Stop TTS"
                        onclick={stopTTS}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            stroke="none"
                        >
                            <rect x="6" y="6" width="12" height="12" />
                        </svg>
                    </button>
                {/if}
            </div>

            <div class="h-4 w-[1px] bg-white/10 mx-1 shrink-0"></div>

            <div
                class="flex items-center gap-1.5 shrink-0"
                role="group"
                aria-label="Status"
            >
                <span
                    class="w-1.5 h-1.5 rounded-full shrink-0"
                    style="background-color: {$lmStudioConnected === true
                        ? '#22c55e'
                        : $lmStudioConnected === false
                          ? $cloudApisAvailable
                              ? '#3b82f6'
                              : '#ef4444'
                          : '#94a3b8'};"
                    aria-hidden="true"
                ></span>
            </div>
        </div>
    </div>
</header>
