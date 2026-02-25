<script>
    import { get } from "svelte/store";
    import { workspaceRoot, fileServerUrl } from "$lib/stores.js";
    import { onMount } from "svelte";
    import DiffModal from "./DiffModal.svelte";

    let status = $state("");
    let commitMessage = $state("");
    let loading = $state(false);
    let error = $state("");
    let output = $state("");

    // Diff Modal state
    let diffModalOpen = $state(false);
    let diffFilePath = $state("");

    const PRESETS = [
        { label: "feat", title: "New feature", color: "#4f46e5" },
        { label: "fix", title: "Bug fix", color: "#ef4444" },
        { label: "refactor", title: "Code refactoring", color: "#8b5cf6" },
        { label: "docs", title: "Documentation changes", color: "#06b6d4" },
        { label: "chore", title: "Maintenance task", color: "#64748b" },
        { label: "test", title: "Adding or fixing tests", color: "#ec4899" },
    ];

    const STATUS_MAP = {
        M: "Modified",
        A: "Added",
        D: "Deleted",
        R: "Renamed",
        C: "Copied",
        U: "Unmerged",
        "??": "Untracked",
        "!!": "Ignored",
    };

    function getStatusInfo(line) {
        const code = line.substring(0, 2).trim();
        const file = line.substring(3);
        const desc = STATUS_MAP[code] || "Changed";
        return { code, file, desc };
    }

    const parsedStatus = $derived(
        status.split("\n").filter(Boolean).map(getStatusInfo),
    );

    async function fetchStatus() {
        const root = get(workspaceRoot);
        const server = get(fileServerUrl);
        if (!root) return;
        try {
            const res = await fetch(
                `${server}/git/status?root=${encodeURIComponent(root)}`,
            );
            if (!res.ok) {
                const data = await res.json();
                error = data.error || "Git not initialized or not found";
                status = "";
                return;
            }
            const data = await res.json();
            status = data.status;
            error = "";
        } catch (e) {
            error = e.message;
        }
    }

    function applyPreset(p) {
        const prefix = p + ": ";
        if (commitMessage.startsWith(prefix)) return;
        commitMessage = prefix + commitMessage.trim();
    }

    async function suggestMessage() {
        if (!status) return;
        loading = true;
        try {
            // We'll provide a few generic suggestions based on common patterns in the status
            const lines = status.split("\n").filter(Boolean);
            if (
                lines.some(
                    (l) =>
                        l.includes("package.json") ||
                        l.includes("node_modules"),
                )
            ) {
                commitMessage = "chore: update dependencies";
            } else if (lines.some((l) => l.includes(".md"))) {
                commitMessage = "docs: update documentation";
            } else if (lines.length === 1) {
                const info = getStatusInfo(lines[0]);
                commitMessage = `feat: update ${info.file.split("/").pop()}`;
            } else {
                commitMessage = `feat: progress on ${lines.length} files`;
            }
        } finally {
            loading = false;
        }
    }

    async function handleCommit() {
        if (!commitMessage.trim()) return;
        loading = true;
        error = "";
        output = "";
        const root = get(workspaceRoot);
        const server = get(fileServerUrl);
        try {
            const res = await fetch(`${server}/git/commit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ root, message: commitMessage }),
            });
            const data = await res.json();
            if (res.ok) {
                output = data.output;
                commitMessage = "";
                fetchStatus();
            } else {
                error = data.error;
            }
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function handlePush() {
        loading = true;
        error = "";
        output = "";
        const root = get(workspaceRoot);
        const server = get(fileServerUrl);
        try {
            const res = await fetch(`${server}/git/push`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ root }),
            });
            const data = await res.json();
            if (res.ok) {
                output = data.output;
                fetchStatus();
            } else {
                error = data.error;
            }
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    function openDiff(filePath) {
        const root = get(workspaceRoot);
        diffFilePath = filePath.startsWith("/")
            ? filePath
            : `${root}/${filePath}`;
        diffModalOpen = true;
    }

    onMount(fetchStatus);
</script>

<div
    class="flex flex-col h-full p-3 overflow-hidden"
    style="background-color: var(--ui-bg-sidebar);"
>
    <div class="flex items-center justify-between mb-4 shrink-0">
        <h2
            class="text-[10px] font-bold uppercase tracking-widest opacity-50"
            style="color: var(--ui-text-primary);"
        >
            Source Control
        </h2>
        <div class="flex items-center gap-1">
            <button
                onclick={fetchStatus}
                class="p-1.5 hover:bg-black/10 dark:hover:bg-white/5 rounded transition-colors"
                title="Refresh Status"
            >
                <svg
                    class="w-3.5 h-3.5"
                    style="color: var(--ui-text-secondary);"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                >
                    <path
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
            </button>
        </div>
    </div>

    {#if status}
        <div
            class="flex-1 overflow-y-auto mb-4 border rounded p-1"
            style="background-color: var(--ui-bg-main); border-color: var(--ui-border);"
        >
            <div class="space-y-0.5">
                {#each parsedStatus as item}
                    <button
                        type="button"
                        class="flex items-center gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 group cursor-pointer w-full text-left outline-none focus:bg-black/5 dark:focus:bg-white/5"
                        title="Click to view changes: {item.file}"
                        onclick={() => openDiff(item.file)}
                    >
                        <span
                            class="w-4 text-[10px] font-bold text-center shrink-0"
                            style:color={item.code === "M"
                                ? "#eab308"
                                : item.code === "??"
                                  ? "#22c55e"
                                  : item.code === "D"
                                    ? "#ef4444"
                                    : "var(--ui-text-secondary)"}
                        >
                            {item.code}
                        </span>
                        <span
                            class="text-[10px] truncate flex-1 opacity-80 group-hover:opacity-100"
                            style="color: var(--ui-text-primary);"
                        >
                            {item.file}
                        </span>
                    </button>
                {/each}
            </div>
        </div>
    {:else if !error}
        <div
            class="flex-1 flex flex-col items-center justify-center opacity-40 text-[11px] space-y-2 px-4 text-center"
        >
            <svg
                class="w-8 h-8 opacity-20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
            </svg>
            <p>Your branch is up to date.</p>
        </div>
    {/if}

    {#if error}
        <div
            class="p-2 mb-3 text-[11px] rounded border"
            style="background-color: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);"
        >
            {error}
        </div>
    {/if}

    {#if output}
        <div
            class="p-2 mb-3 text-[10px] font-mono rounded max-h-32 overflow-y-auto border"
            style="background-color: rgba(0,0,0,0.1); color: var(--ui-text-secondary); border-color: var(--ui-border);"
        >
            {output}
        </div>
    {/if}

    <div class="mb-4">
        <details
            class="group border rounded-lg overflow-hidden transition-all"
            style="border-color: var(--ui-border); background-color: var(--ui-bg-main);"
        >
            <summary
                class="list-none p-3 text-[10px] font-bold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between transition-colors select-none"
                style="color: var(--ui-text-primary);"
                title="Common Git commands FAQ"
            >
                <div class="flex items-center gap-2">
                    <svg
                        class="w-3.5 h-3.5 opacity-60"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                        />
                    </svg>
                    <span class="tracking-wider">GIT COMMANDS HELP</span>
                </div>
                <svg
                    class="w-3 h-3 transform group-open:rotate-180 transition-transform opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                >
                    <path d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <div
                class="p-3 text-[10px] space-y-3 border-t bg-black/[0.02] dark:bg-white/[0.02]"
                style="border-color: var(--ui-border); color: var(--ui-text-secondary);"
            >
                <div class="flex flex-col gap-1">
                    <code class="font-bold text-[11px]" style="color: #3b82f6;"
                        >git status</code
                    >
                    <p class="leading-relaxed opacity-90">
                        Shows which files have changed since the last commit.
                    </p>
                </div>
                <div class="flex flex-col gap-1">
                    <code class="font-bold text-[11px]" style="color: #3b82f6;"
                        >git commit -m "..."</code
                    >
                    <p class="leading-relaxed opacity-90">
                        Saves your changes locally with a descriptive message.
                    </p>
                </div>
                <div class="flex flex-col gap-1">
                    <code class="font-bold text-[11px]" style="color: #3b82f6;"
                        >git push</code
                    >
                    <p class="leading-relaxed opacity-90">
                        Sends your local commits to the remote server (GitHub).
                    </p>
                </div>
                <div
                    class="pt-1 mt-1 border-t opacity-40 text-[9px] italic"
                    style="border-color: var(--ui-border)"
                >
                    Tip: Use the tags below for standardized commit messages.
                </div>
            </div>
        </details>
    </div>

    <div
        class="space-y-3 shrink-0 pt-2 border-t"
        style="border-color: var(--ui-border);"
    >
        <div class="flex flex-wrap gap-1 mb-1.5">
            {#each PRESETS as p}
                <button
                    onclick={() => applyPreset(p.label)}
                    class="px-2.5 py-1 text-[10px] font-bold rounded-md bg-black/5 dark:bg-white/5 border border-transparent transition-all hover:border-[var(--tag-color)] hover:bg-white dark:hover:bg-black/20"
                    style="--tag-color: {p.color}; color: var(--ui-text-secondary);"
                    title={p.title}
                >
                    {p.label}
                </button>
            {/each}
        </div>

        <div class="relative">
            <textarea
                bind:value={commitMessage}
                placeholder="Message (Ctrl+Enter to commit)"
                class="w-full h-20 rounded p-2 text-xs resize-none focus:outline-none border transition-all"
                style="background-color: var(--ui-bg-main); border-color: var(--ui-border); color: var(--ui-text-primary);"
                onkeydown={(e) =>
                    (e.ctrlKey || e.metaKey) &&
                    e.key === "Enter" &&
                    handleCommit()}
            ></textarea>

            <button
                onclick={suggestMessage}
                disabled={!status || loading}
                class="absolute bottom-2 right-2 p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors group"
                title="Suggest an 'Adaptive' commit message based on your changes"
                aria-label="Suggest message"
            >
                <svg
                    class="w-4 h-4 {loading ? 'animate-pulse' : ''}"
                    style="color: var(--ui-accent);"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.456-2.454L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.454zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                    />
                </svg>
            </button>
        </div>

        <div class="flex gap-2">
            <button
                onclick={handleCommit}
                disabled={loading || !commitMessage.trim()}
                class="flex-1 py-2 text-xs font-bold rounded transition-all active:scale-[0.98] disabled:opacity-40 disabled:scale-100 shadow-sm"
                style="background-color: var(--ui-accent); color: var(--ui-bg-main);"
                title="Save your changes locally with a commit"
            >
                {loading ? "COMMITTING..." : "COMMIT"}
            </button>
            <button
                onclick={handlePush}
                disabled={loading}
                class="px-4 py-2 text-xs font-bold rounded border transition-all active:scale-[0.98] disabled:opacity-40 disabled:scale-100"
                style="background-color: transparent; border-color: var(--ui-border); color: var(--ui-text-primary);"
                title="Send your commits to the remote repository (GitHub)"
            >
                PUSH
            </button>
        </div>
    </div>
</div>

<DiffModal bind:isOpen={diffModalOpen} filePath={diffFilePath} />

<style>
    textarea:focus {
        border-color: var(--ui-accent) !important;
        box-shadow: 0 0 0 2px
            color-mix(in srgb, var(--ui-accent) 20%, transparent);
    }
</style>
