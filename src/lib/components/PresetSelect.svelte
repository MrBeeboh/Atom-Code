<script>
  import { get } from 'svelte/store';
  import { setPerModelOverride, presetDefaultModels, selectedModelId, models, settings } from '$lib/stores.js';

  const PRESETS = [
    { name: 'Code', prompt: 'You are an expert programmer. Be concise. Prefer code over prose. Use fenced code blocks with language tags.' },
    { name: 'Debug', prompt: 'You are a debugging expert. Analyze code for bugs systematically. Show the fix with a clear before/after. Ask clarifying questions about error messages or behavior if needed.' },
    { name: 'Review', prompt: 'You are a senior code reviewer. Check for bugs, security issues, performance problems, and style. Be thorough but constructive. Rate severity of issues found.' },
    { name: 'Refactor', prompt: 'You are a refactoring specialist. Improve code structure, readability, and maintainability without changing behavior. Explain your reasoning for each change.' },
    { name: 'Explain', prompt: 'You are a patient programming teacher. Explain code step by step. Use analogies when helpful. Adjust complexity to the question.' },
    { name: 'General', prompt: 'You are a helpful assistant.' },
  ];

  let { compact = false } = $props();
  let currentPresetName = $state('');

  $effect(() => {
    const unsub = settings.subscribe((s) => {
      currentPresetName = PRESETS.find((p) => (s?.system_prompt ?? '').trim() === p.prompt.trim())?.name ?? '';
    });
    return () => unsub();
  });

  function applyPreset(name) {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const byPreset = get(presetDefaultModels) ?? {};
    const defaultModel = byPreset[name];
    const list = get(models) ?? [];
    const modelId = defaultModel && list.some((m) => m.id === defaultModel) ? defaultModel : get(selectedModelId);
    if (modelId) setPerModelOverride(modelId, { system_prompt: preset.prompt });
    if (defaultModel && list.some((m) => m.id === defaultModel)) selectedModelId.set(defaultModel);
  }
</script>

<select
  class="rounded-[12px] border text-sm font-medium cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 min-h-[36px] {compact ? 'px-3 py-1.5' : 'px-3 py-2'}"
  style="background: var(--ui-input-bg); color: var(--ui-text-primary); border-color: var(--ui-border); min-width: {compact ? '6rem' : '8rem'};"
  value={currentPresetName}
  onchange={(e) => {
    const v = e.currentTarget.value;
    if (v) applyPreset(v);
  }}
  title="Preset (system prompt + default model)"
  aria-label="Preset">
  <option value="">Preset</option>
  {#each PRESETS as p}
    <option value={p.name}>{p.name}</option>
  {/each}
</select>
