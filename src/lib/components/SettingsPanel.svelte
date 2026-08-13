<script>
  import { fly } from "svelte/transition";
  import { backOut, quintOut } from "svelte/easing";
  import {
    globalDefault,
    updateGlobalDefault,
    selectedModelId,
    models,
    presetDefaultModels,
    lmStudioBaseUrl,
    voiceServerUrl,
    lmStudioUnloadHelperUrl,
    terminalServerUrl,
    fileServerUrl,
    workspaceRoot,
    deepSeekApiKey,
    grokApiKey,
    togetherApiKey,
    deepinfraApiKey,
    braveApiKey,
    githubToken,
    performanceMode,
    isTauri,
    settingsSection,
    closeSettings,
  } from "$lib/stores.js";
  import {
    SETTINGS_SECTIONS,
    SETTINGS_SECTION_LABELS,
    hasSecretValue,
  } from "$lib/settingsUi.js";
  import { syncBraveKeyToProxy } from "$lib/duckduckgo.js";
  import { storeKey } from "$lib/secureKeys.js";

  let { onclose } = $props();

  const DEFAULTS = {
    audio_enabled: true,
    audio_clicks: true,
    audio_volume: 0.25,
  };

  let audioEnabled = $state(DEFAULTS.audio_enabled);
  let audioClicks = $state(DEFAULTS.audio_clicks);
  let audioVolume = $state(DEFAULTS.audio_volume);
  let reveal = $state({
    deepseek: false,
    grok: false,
    brave: false,
    github: false,
    deepinfra: false,
    together: false,
  });
  let saving = $state(false);

  $effect(() => {
    const g = $globalDefault;
    audioEnabled = g.audio_enabled ?? DEFAULTS.audio_enabled;
    audioClicks = g.audio_clicks ?? DEFAULTS.audio_clicks;
    audioVolume = g.audio_volume ?? DEFAULTS.audio_volume;
  });

  const PRESETS = [
    { name: "General", prompt: "You are a helpful assistant." },
    {
      name: "Code",
      prompt:
        "You are an expert programmer. Be concise. Prefer code over prose when relevant.",
    },
    {
      name: "Research",
      prompt:
        "You are a thorough researcher. Cite sources when possible. Structure answers with clear sections.",
    },
    {
      name: "Creative",
      prompt:
        "You are a creative writer. Use vivid language and varied structure. Be engaging and original.",
    },
  ];

  function close() {
    if (onclose) onclose();
    else closeSettings();
  }

  function setPresetDefaultModel(presetName, modelId) {
    presetDefaultModels.update((m) => {
      const next = { ...m };
      if (modelId) next[presetName] = modelId;
      else delete next[presetName];
      return next;
    });
    if (modelId) selectedModelId.set(modelId);
  }

  async function save() {
    updateGlobalDefault({
      audio_enabled: !!audioEnabled,
      audio_clicks: !!audioClicks,
      audio_volume: Math.max(0, Math.min(1, Number(audioVolume) || 0)),
    });

    saving = true;
    try {
      await Promise.all([
        storeKey("deepSeekApiKey", $deepSeekApiKey),
        storeKey("grokApiKey", $grokApiKey),
        storeKey("togetherApiKey", $togetherApiKey),
        storeKey("deepinfraApiKey", $deepinfraApiKey),
        storeKey("braveApiKey", $braveApiKey),
        storeKey("githubToken", $githubToken),
      ]);
      close();
    } catch (err) {
      alert(`Failed to save secure keys: ${err.message}`);
    } finally {
      saving = false;
    }
  }

  function resetToDefaults() {
    audioEnabled = DEFAULTS.audio_enabled;
    audioClicks = DEFAULTS.audio_clicks;
    audioVolume = DEFAULTS.audio_volume;
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  function onWindowKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div
  class="settings-backdrop"
  role="presentation"
  onclick={onBackdropClick}
  onkeydown={(e) => e.key === "Escape" && close()}
>
  <div
    class="settings-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
    in:fly={{ x: 300, duration: 400, easing: backOut }}
    out:fly={{ x: 300, duration: 300, easing: quintOut }}
    onclick={(e) => e.stopPropagation()}
  >
    <div class="settings-header">
      <div>
        <h2 id="settings-title" class="settings-title">Settings</h2>
        <p class="settings-sub">
          Connection &amp; API keys. Model/load settings are in the Intel panel
          (right).
        </p>
      </div>
      <button
        type="button"
        class="settings-icon-btn"
        onclick={close}
        title="Close"
        aria-label="Close">✕</button
      >
    </div>

    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      {#each SETTINGS_SECTIONS as id (id)}
        <button
          type="button"
          role="tab"
          id="settings-tab-{id}"
          aria-selected={$settingsSection === id}
          aria-controls="settings-panel-{id}"
          class="settings-tab"
          class:active={$settingsSection === id}
          onclick={() => settingsSection.set(id)}
        >
          {SETTINGS_SECTION_LABELS[id]}
        </button>
      {/each}
    </div>

    <div class="settings-body">
      {#if $settingsSection === "connection"}
        <div
          id="settings-panel-connection"
          role="tabpanel"
          aria-labelledby="settings-tab-connection"
          class="settings-stack"
        >
          <div>
            <label for="settings-lmstudio-url" class="settings-label"
              >LM Studio URL</label
            >
            <input
              id="settings-lmstudio-url"
              type="url"
              bind:value={$lmStudioBaseUrl}
              placeholder="http://localhost:1234"
              class="settings-input"
            />
            <p class="settings-hint">
              Empty = localhost:1234. Enable CORS in LM Studio → Developer.
            </p>
          </div>
          <div>
            <label for="settings-unload-helper-url" class="settings-label"
              >Unload helper URL</label
            >
            <input
              id="settings-unload-helper-url"
              type="url"
              bind:value={$lmStudioUnloadHelperUrl}
              placeholder="http://localhost:8766"
              class="settings-input"
            />
            <p class="settings-hint">
              Optional. <code>python scripts/unload_helper_server.py</code>.
              Leave empty to disable.
            </p>
          </div>
          <div>
            <label for="settings-voice-url" class="settings-label"
              >Voice server URL</label
            >
            <input
              id="settings-voice-url"
              type="url"
              bind:value={$voiceServerUrl}
              placeholder="http://localhost:8765"
              class="settings-input"
            />
            <p class="settings-hint">
              Mic/voice. Default port 8765; see voice-server/README.
            </p>
          </div>
          <div>
            <label for="settings-terminal-url" class="settings-label"
              >Terminal server URL</label
            >
            <input
              id="settings-terminal-url"
              type="url"
              bind:value={$terminalServerUrl}
              placeholder="ws://localhost:8767"
              class="settings-input"
            />
            <p class="settings-hint">
              WebSocket for integrated terminal. Run
              <code>services/terminal-server</code>. Toggle panel: Ctrl+`
            </p>
          </div>
          {#if !isTauri}
            <div>
              <label for="settings-file-server-url" class="settings-label"
                >File server URL</label
              >
              <input
                id="settings-file-server-url"
                type="url"
                bind:value={$fileServerUrl}
                placeholder="http://localhost:8768"
                class="settings-input"
              />
              <p class="settings-hint">
                For file explorer and pinned context. Run
                <code>services/file-server</code>. Toggle: Ctrl+E
              </p>
            </div>
          {/if}
          <div>
            <label for="settings-workspace-root" class="settings-label"
              >Workspace root</label
            >
            <input
              id="settings-workspace-root"
              type="text"
              bind:value={$workspaceRoot}
              placeholder="/path/to/project"
              class="settings-input"
            />
            <p class="settings-hint">
              Default path for file explorer tree. Also set in the File Explorer
              panel.
            </p>
          </div>
        </div>
      {:else if $settingsSection === "apikeys"}
        <div
          id="settings-panel-apikeys"
          role="tabpanel"
          aria-labelledby="settings-tab-apikeys"
          class="settings-stack"
        >
          <p class="settings-hint">
            Keys stay in this browser (or the desktop keychain). Set a key to
            show that provider’s models in the dropdown.
          </p>

          <div>
            <div class="settings-label-row">
              <label for="settings-deepseek-key" class="settings-label"
                >DeepSeek API key</label
              >
              <span
                class="settings-badge"
                class:set={hasSecretValue($deepSeekApiKey)}
                >{hasSecretValue($deepSeekApiKey) ? "Set" : "Not set"}</span
              >
            </div>
            <div class="settings-secret-row">
              <input
                id="settings-deepseek-key"
                type={reveal.deepseek ? "text" : "password"}
                autocomplete="off"
                bind:value={$deepSeekApiKey}
                placeholder="API key (paste without extra spaces)"
                class="settings-input"
              />
              <button
                type="button"
                class="settings-reveal"
                onclick={() => (reveal.deepseek = !reveal.deepseek)}
                aria-label={reveal.deepseek ? "Hide key" : "Show key"}
                >{reveal.deepseek ? "Hide" : "Show"}</button
              >
            </div>
            <p class="settings-hint">
              <a
                href="https://platform.deepseek.com"
                target="_blank"
                rel="noopener noreferrer">platform.deepseek.com</a
              >
            </p>
          </div>

          <div>
            <div class="settings-label-row">
              <label for="settings-grok-key" class="settings-label"
                >Grok (xAI) API key</label
              >
              <span
                class="settings-badge"
                class:set={hasSecretValue($grokApiKey)}
                >{hasSecretValue($grokApiKey) ? "Set" : "Not set"}</span
              >
            </div>
            <div class="settings-secret-row">
              <input
                id="settings-grok-key"
                type={reveal.grok ? "text" : "password"}
                autocomplete="off"
                bind:value={$grokApiKey}
                placeholder="xai-…"
                class="settings-input"
              />
              <button
                type="button"
                class="settings-reveal"
                onclick={() => (reveal.grok = !reveal.grok)}
                aria-label={reveal.grok ? "Hide key" : "Show key"}
                >{reveal.grok ? "Hide" : "Show"}</button
              >
            </div>
            <p class="settings-hint">
              <a
                href="https://console.x.ai"
                target="_blank"
                rel="noopener noreferrer">console.x.ai</a
              >
            </p>
          </div>

          <div>
            <div class="settings-label-row">
              <label for="settings-brave-key" class="settings-label"
                >Brave Search API key</label
              >
              <span
                class="settings-badge"
                class:set={hasSecretValue($braveApiKey)}
                >{hasSecretValue($braveApiKey) ? "Set" : "Not set"}</span
              >
            </div>
            <div class="settings-secret-row">
              <input
                id="settings-brave-key"
                type={reveal.brave ? "text" : "password"}
                autocomplete="off"
                bind:value={$braveApiKey}
                onblur={() => syncBraveKeyToProxy($braveApiKey)}
                placeholder="Paste your Brave Search API key"
                class="settings-input"
              />
              <button
                type="button"
                class="settings-reveal"
                onclick={() => (reveal.brave = !reveal.brave)}
                aria-label={reveal.brave ? "Hide key" : "Show key"}
                >{reveal.brave ? "Hide" : "Show"}</button
              >
            </div>
            <p class="settings-hint">
              Web search (globe).
              <a
                href="https://search.brave.com/help/api"
                target="_blank"
                rel="noopener noreferrer">search.brave.com/help/api</a
              >
            </p>
          </div>

          <div>
            <div class="settings-label-row">
              <label for="settings-github-token" class="settings-label"
                >GitHub token</label
              >
              <span
                class="settings-badge"
                class:set={hasSecretValue($githubToken)}
                >{hasSecretValue($githubToken) ? "Set" : "Not set"}</span
              >
            </div>
            <div class="settings-secret-row">
              <input
                id="settings-github-token"
                type={reveal.github ? "text" : "password"}
                autocomplete="off"
                bind:value={$githubToken}
                placeholder="ghp_… (only for private repo fetch)"
                class="settings-input"
              />
              <button
                type="button"
                class="settings-reveal"
                onclick={() => (reveal.github = !reveal.github)}
                aria-label={reveal.github ? "Hide token" : "Show token"}
                >{reveal.github ? "Hide" : "Show"}</button
              >
            </div>
            <p class="settings-hint">
              Optional. Paste a GitHub URL in chat to fetch repo context. Token
              only needed for private repos. Never sent to the model.
            </p>
          </div>

          <div>
            <div class="settings-label-row">
              <label for="settings-deepinfra-key" class="settings-label"
                >DeepInfra API key</label
              >
              <span
                class="settings-badge"
                class:set={hasSecretValue($deepinfraApiKey)}
                >{hasSecretValue($deepinfraApiKey) ? "Set" : "Not set"}</span
              >
            </div>
            <div class="settings-secret-row">
              <input
                id="settings-deepinfra-key"
                type={reveal.deepinfra ? "text" : "password"}
                autocomplete="off"
                bind:value={$deepinfraApiKey}
                placeholder="…"
                class="settings-input"
              />
              <button
                type="button"
                class="settings-reveal"
                onclick={() => (reveal.deepinfra = !reveal.deepinfra)}
                aria-label={reveal.deepinfra ? "Hide key" : "Show key"}
                >{reveal.deepinfra ? "Hide" : "Show"}</button
              >
            </div>
            <p class="settings-hint">
              Image/video when DeepSeek.
              <a
                href="https://deepinfra.com"
                target="_blank"
                rel="noopener noreferrer">deepinfra.com</a
              >
            </p>
          </div>

          <div>
            <div class="settings-label-row">
              <label for="settings-together-key" class="settings-label"
                >Together AI API key</label
              >
              <span
                class="settings-badge"
                class:set={hasSecretValue($togetherApiKey)}
                >{hasSecretValue($togetherApiKey) ? "Set" : "Not set"}</span
              >
            </div>
            <div class="settings-secret-row">
              <input
                id="settings-together-key"
                type={reveal.together ? "text" : "password"}
                autocomplete="off"
                bind:value={$togetherApiKey}
                placeholder="…"
                class="settings-input"
              />
              <button
                type="button"
                class="settings-reveal"
                onclick={() => (reveal.together = !reveal.together)}
                aria-label={reveal.together ? "Hide key" : "Show key"}
                >{reveal.together ? "Hide" : "Show"}</button
              >
            </div>
            <p class="settings-hint">
              Legacy image when DeepSeek.
              <a
                href="https://api.together.xyz"
                target="_blank"
                rel="noopener noreferrer">api.together.xyz</a
              >
            </p>
          </div>
        </div>
      {:else if $settingsSection === "performance"}
        <div
          id="settings-panel-performance"
          role="tabpanel"
          aria-labelledby="settings-tab-performance"
          class="settings-stack"
        >
          <label class="settings-check">
            <input
              type="checkbox"
              bind:checked={$performanceMode}
              class="accent-themed"
            />
            <span>Performance Mode</span>
          </label>
          <p class="settings-hint">
            Disables expensive UI effects (blur, heavy animations) for better
            responsiveness on lower-end hardware or under heavy LLM load.
          </p>
        </div>
      {:else if $settingsSection === "audio"}
        <div
          id="settings-panel-audio"
          role="tabpanel"
          aria-labelledby="settings-tab-audio"
          class="settings-stack"
        >
          <label class="settings-check">
            <input
              type="checkbox"
              bind:checked={audioEnabled}
              class="accent-themed"
            />
            <span>Enable audio feedback</span>
          </label>
          <label class="settings-check">
            <input
              type="checkbox"
              bind:checked={audioClicks}
              disabled={!audioEnabled}
              class="accent-themed"
            />
            <span>Click sounds</span>
          </label>
          <div>
            <label for="settings-audio-volume" class="settings-label"
              >Volume</label
            >
            <input
              id="settings-audio-volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={audioVolume}
              disabled={!audioEnabled}
              class="w-full h-2 rounded-full accent-themed"
            />
          </div>
        </div>
      {:else}
        <div
          id="settings-panel-presets"
          role="tabpanel"
          aria-labelledby="settings-tab-presets"
          class="settings-stack"
        >
          <p class="settings-hint">
            Model to switch to when selecting a preset from the header.
          </p>
          {#each PRESETS as p (p.name)}
            <div class="settings-preset-row">
              <span class="settings-preset-name">{p.name}</span>
              <select
                class="settings-input settings-select"
                value={$presetDefaultModels[p.name] ?? ""}
                onchange={(e) =>
                  setPresetDefaultModel(p.name, e.currentTarget.value || null)}
                aria-label="Default model for {p.name}"
              >
                <option value="">None</option>
                {#each $models as m (m.id)}
                  <option value={m.id}>{m.id}</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="settings-footer">
      <button type="button" class="settings-btn ghost" onclick={resetToDefaults}
        >Reset to defaults</button
      >
      <div class="settings-footer-actions">
        <button type="button" class="settings-btn ghost" onclick={close}
          >Cancel</button
        >
        <button
          type="button"
          class="settings-btn primary"
          onclick={save}
          disabled={saving}>{saving ? "Saving…" : "Save"}</button
        >
      </div>
    </div>
  </div>
</div>

<style>
  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.45);
  }
  .settings-dialog {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 36rem;
    max-height: 90vh;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid var(--glass-border, var(--ui-border));
    background: var(--glass-bg, var(--ui-bg-main));
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
    color: var(--ui-text-primary);
  }
  .settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 1.1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--ui-border);
  }
  .settings-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
  .settings-sub {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: var(--ui-text-secondary);
  }
  .settings-icon-btn {
    flex-shrink: 0;
    padding: 0.35rem 0.5rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--ui-text-secondary);
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
  }
  .settings-icon-btn:hover {
    background: color-mix(in srgb, var(--ui-border) 40%, transparent);
    color: var(--ui-text-primary);
  }
  .settings-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.6rem 1.25rem 0;
  }
  .settings-tab {
    padding: 0.4rem 0.7rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--ui-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }
  .settings-tab:hover {
    background: color-mix(in srgb, var(--ui-accent) 10%, transparent);
  }
  .settings-tab.active {
    color: var(--ui-text-primary);
    border-color: var(--ui-border);
    background: color-mix(in srgb, var(--ui-accent) 14%, transparent);
  }
  .settings-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem 1.25rem;
  }
  .settings-stack {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .settings-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ui-text-secondary);
    margin-bottom: 0.3rem;
  }
  .settings-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }
  .settings-label-row .settings-label {
    margin-bottom: 0;
  }
  .settings-badge {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    color: var(--ui-text-secondary);
    background: color-mix(in srgb, var(--ui-border) 50%, transparent);
  }
  .settings-badge.set {
    color: var(--ui-accent);
    background: color-mix(in srgb, var(--ui-accent) 16%, transparent);
  }
  .settings-input {
    width: 100%;
    border-radius: 8px;
    border: 1px solid var(--ui-border);
    background: var(--ui-input-bg, var(--ui-bg-main));
    color: var(--ui-text-primary);
    padding: 0.5rem 0.7rem;
    font-size: 0.85rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .settings-input:focus {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }
  .settings-select {
    font-family: inherit;
    min-width: 10rem;
  }
  .settings-secret-row {
    display: flex;
    gap: 0.4rem;
  }
  .settings-reveal {
    flex-shrink: 0;
    padding: 0 0.7rem;
    border-radius: 8px;
    border: 1px solid var(--ui-border);
    background: transparent;
    color: var(--ui-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }
  .settings-reveal:hover {
    color: var(--ui-text-primary);
  }
  .settings-hint {
    margin: 0.3rem 0 0;
    font-size: 0.75rem;
    color: var(--ui-text-secondary);
  }
  .settings-hint a {
    text-decoration: underline;
    color: inherit;
  }
  .settings-hint code {
    padding: 0 0.25rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--ui-border) 45%, transparent);
  }
  .settings-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .settings-preset-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .settings-preset-name {
    min-width: 4.5rem;
    font-size: 0.8rem;
    color: var(--ui-text-secondary);
  }
  .settings-footer {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.85rem 1.25rem;
    border-top: 1px solid var(--ui-border);
  }
  .settings-footer-actions {
    display: flex;
    gap: 0.5rem;
  }
  .settings-btn {
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .settings-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .settings-btn.ghost {
    border: 1px solid var(--ui-border);
    background: transparent;
    color: var(--ui-text-secondary);
  }
  .settings-btn.ghost:hover {
    color: var(--ui-text-primary);
    background: color-mix(in srgb, var(--ui-border) 30%, transparent);
  }
  .settings-btn.primary {
    border: none;
    background: var(--ui-accent);
    color: #fff;
  }
  .settings-btn.primary:hover:not(:disabled) {
    opacity: 0.92;
  }
</style>
