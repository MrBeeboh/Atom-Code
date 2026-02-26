<script>
    let {
        open = $bindable(false),
        prompt = $bindable(""),
        engine = $bindable(0),
        quality = $bindable(2),
        size = $bindable(0),
        n = $bindable(0),
        generating = false,
        engineOptions = [],
        qualityOptions = [],
        sizeOptions = [],
        nOptions = [],
        canGenerate = false,
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
        aria-labelledby="image-modal-title"
    >
        <div
            class="w-full max-w-md rounded-xl shadow-xl p-5 flex flex-col gap-4"
            class="glass-modal"
        >
            <h2
                id="image-modal-title"
                class="text-lg font-semibold"
                style="color: var(--ui-text-primary);"
            >
                Generate image
            </h2>
            <div>
                <label
                    for="image-modal-prompt"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);">Prompt</label
                >
                <textarea
                    id="image-modal-prompt"
                    bind:value={prompt}
                    rows="3"
                    class="w-full rounded border px-3 py-2 text-sm resize-none"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                    placeholder="Describe the image you want"
                ></textarea>
            </div>
            <div>
                <label
                    for="image-modal-engine"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);"
                    >Choose Image Engine</label
                >
                <select
                    id="image-modal-engine"
                    bind:value={engine}
                    class="w-full rounded border px-3 py-2 text-sm"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                >
                    {#each engineOptions as opt, i}
                        <option value={i}>{opt.label}</option>
                    {/each}
                </select>
            </div>
            <div>
                <label
                    for="image-modal-quality"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);"
                    >Quality / Steps</label
                >
                <select
                    id="image-modal-quality"
                    bind:value={quality}
                    class="w-full rounded border px-3 py-2 text-sm"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                >
                    {#each qualityOptions as opt, i}
                        <option value={i}>{opt.label}</option>
                    {/each}
                </select>
            </div>
            <div>
                <label
                    for="image-modal-size"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);">Size</label
                >
                <select
                    id="image-modal-size"
                    bind:value={size}
                    class="w-full rounded border px-3 py-2 text-sm"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                >
                    {#each sizeOptions as opt, i}
                        <option value={i}>{opt.label}</option>
                    {/each}
                </select>
            </div>
            <div>
                <label
                    for="image-modal-n"
                    class="block text-sm font-medium mb-1"
                    style="color: var(--ui-text-secondary);"
                    >Number of images</label
                >
                <select
                    id="image-modal-n"
                    bind:value={n}
                    class="w-full rounded border px-3 py-2 text-sm"
                    style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
                >
                    {#each nOptions as num, i}
                        <option value={i}>{num}</option>
                    {/each}
                </select>
            </div>
            <div class="flex gap-2 justify-end pt-2">
                <button
                    type="button"
                    class="px-4 py-2 rounded-lg text-sm font-medium"
                    style="background: var(--ui-input-bg); border: 1px solid var(--ui-border); color: var(--ui-text-primary);"
                    onclick={onClose}>Cancel</button
                >
                <button
                    type="button"
                    class="image-modal-generate-btn px-4 py-2 rounded-lg text-sm font-medium"
                    style="background: var(--ui-accent);"
                    onclick={onGenerate}
                    disabled={generating || !canGenerate}
                    >{generating ? "Generating…" : "Generate"}</button
                >
            </div>
        </div>
    </div>
{/if}
