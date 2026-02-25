<script>
    let {
        open = $bindable(false),
        prompt = $bindable(""),
        engine = $bindable(0),
        generating = false,
        engineOptions = [],
        onClose,
        onGenerate,
    } = $props();
</script>

{#if open}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background: rgba(0,0,0,0.5);"
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-modal-title"
    >
        <div
            class="w-full max-w-md rounded-xl shadow-xl p-5 flex flex-col gap-4"
            style="background: var(--ui-bg-main); border: 1px solid var(--ui-border);"
        >
            <h2
                id="video-modal-title"
                class="text-lg font-semibold"
                style="color: var(--ui-text-primary);"
            >
                Generate video
            </h2>
            <div>
                <label
                    for="video-modal-prompt"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);">Prompt</label
                >
                <textarea
                    id="video-modal-prompt"
                    bind:value={prompt}
                    rows="3"
                    class="w-full rounded border px-3 py-2 text-sm resize-none"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                    placeholder="Describe the video you want"
                ></textarea>
            </div>
            <div>
                <label
                    for="video-modal-engine"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);">Model</label
                >
                <select
                    id="video-modal-engine"
                    bind:value={engine}
                    class="w-full rounded border px-3 py-2 text-sm"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                >
                    {#each engineOptions as opt, i}
                        <option value={i}>{opt.label}</option>
                    {/each}
                </select>
            </div>
            <p class="text-xs" style="color: var(--ui-text-secondary);">
                Video can take 5–10+ minutes. Please wait—do not close the tab.
            </p>
            <div class="flex gap-2 justify-end pt-2">
                <button
                    type="button"
                    class="px-4 py-2 rounded-lg text-sm font-medium"
                    style="background: var(--ui-input-bg); border: 1px solid var(--ui-border); color: var(--ui-text-primary);"
                    onclick={onClose}>Cancel</button
                >
                <button
                    type="button"
                    class="video-modal-generate-btn px-4 py-2 rounded-lg text-sm font-medium"
                    style="background: var(--ui-accent);"
                    onclick={onGenerate}
                    disabled={generating || !prompt.trim()}
                    >{generating ? "Generating…" : "Generate"}</button
                >
            </div>
        </div>
    </div>
{/if}
