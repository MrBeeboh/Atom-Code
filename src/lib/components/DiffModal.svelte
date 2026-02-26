<script>
    import { get } from "svelte/store";
    import { workspaceRoot, fileServerUrl } from "$lib/stores.js";

    let { isOpen = $bindable(false), filePath = "" } = $props();
    let diffContent = $state("");
    let loading = $state(false);
    let error = $state("");

    $effect(() => {
        if (isOpen && filePath) {
            fetchDiff();
        }
    });

    async function fetchDiff() {
        loading = true;
        error = "";
        const root = get(workspaceRoot);
        const server = get(fileServerUrl);
        try {
            const res = await fetch(
                `${server}/git/diff?path=${encodeURIComponent(filePath)}&root=${encodeURIComponent(root)}`,
            );
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to fetch diff");
            }
            const data = await res.json();
            diffContent = data.diff;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    function close() {
        isOpen = false;
        diffContent = "";
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onclick={close}
        onkeydown={(e) => e.key === "Escape" && close()}
        role="presentation"
    >
        <div
            class="w-full max-w-4xl h-[80vh] flex flex-col rounded-xl overflow-hidden shadow-2xl border outline-none glass-modal"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
        >
            <div
                class="flex items-center justify-between p-4 border-b shrink-0"
            >
                <div class="flex flex-col">
                    <h3
                        class="text-sm font-bold"
                        style="color: var(--ui-text-primary);"
                    >
                        Changes in {filePath.split("/").pop()}
                    </h3>
                    <p
                        class="text-[10px] opacity-50"
                        style="color: var(--ui-text-primary);"
                    >
                        {filePath}
                    </p>
                </div>
                <button
                    onclick={close}
                    class="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Close diff viewer"
                    title="Close"
                >
                    <svg
                        class="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            <div
                class="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed"
            >
                {#if loading}
                    <div
                        class="flex items-center justify-center h-full opacity-40"
                    >
                        <div class="animate-pulse">Loading diff...</div>
                    </div>
                {:else if error}
                    <div
                        class="p-4 text-red-500 bg-red-500/10 rounded border border-red-500/20"
                    >
                        {error}
                    </div>
                {:else if !diffContent}
                    <div
                        class="flex items-center justify-center h-full opacity-40"
                    >
                        No changes detected.
                    </div>
                {:else}
                    <div class="whitespace-pre">
                        {#each diffContent.split("\n") as line}
                            <div
                                class="px-2 {line.startsWith('+')
                                    ? 'bg-green-500/10 text-green-500'
                                    : line.startsWith('-')
                                      ? 'bg-red-500/10 text-red-500'
                                      : line.startsWith('@@')
                                        ? 'bg-blue-500/10 text-blue-400 opacity-60'
                                        : 'opacity-80'}"
                            >
                                {line}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Prevent body scroll when modal is open */
    :global(body.modal-open) {
        overflow: hidden;
    }
</style>
