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
    } from "$lib/stores.js";
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

    $effect(() => {
        const c = $lmStudioConnected;
        const cloud = $cloudApisAvailable;
        if (c === true) lmStatusMessage = COCKPIT_LM_CONNECTED;
        else if (c === false && cloud)
            lmStatusMessage = COCKPIT_CLOUD_APIS_AVAILABLE;
        else if (c === false) lmStatusMessage = COCKPIT_LM_UNREACHABLE;
        else lmStatusMessage = COCKPIT_LM_CHECKING;
    });
</script>

<header
    class="h-11 shrink-0 flex items-center justify-between px-4 border-b z-30 glass"
    style="border-color: var(--ui-border);"
>
    <!-- Left: Brand & Breadcrumbs -->
    <div class="flex items-center gap-3 overflow-hidden pr-4">
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

        <div class="h-4 w-[1px] bg-white/10 mx-1 shrink-0"></div>

        <div class="flex items-center gap-1 text-[11px] truncate">
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
    </div>

    <!-- Center: Model & Preset -->
    <div class="flex-1 flex items-center justify-center min-w-0 px-4">
        <div
            class="flex items-center gap-2 min-w-0"
            role="group"
            aria-label="Model and preset"
        >
            <div class="shrink-0">
                <PresetSelect compact={true} />
            </div>
            <div class="min-w-0 max-w-[20rem]">
                <ModelSelector />
            </div>
        </div>
    </div>

    <!-- Right: Stats & Theme -->
    <div class="flex items-center gap-4 shrink-0 pl-4">
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
