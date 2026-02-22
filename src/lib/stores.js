/**
 * @file stores.js
 * @description Central Svelte stores and derived state for the app: conversations, models, settings,
 * UI state, and persisted preferences (layout, theme, LM Studio URL, per-model overrides, etc.).
 * Settings resolution: DEFAULT_SETTINGS ← globalDefault ← getRecommendedSettingsForModel ← perModelOverrides.
 */
import { writable, derived, get } from 'svelte/store';
import { detectHardware } from '$lib/hardware.js';
import { getRecommendedSettingsForModel } from '$lib/modelDefaults.js';

/** Currently selected conversation id or null */
export const activeConversationId = writable(null);

/** List of conversations for sidebar */
export const conversations = writable([]);

/** Messages for the active conversation (reactive) */
export const activeMessages = writable([]);

/** Current streaming text; only updated during stream. Stops list re-renders per token. */
export const streamingContent = writable('');

/** When set, ChatInput processes these files (drop anywhere in chat) then clears. */
export const pendingDroppedFiles = writable(null);

/** Loaded LM Studio model list { id }[] */
export const models = writable([]);

/** Hardware detected on startup (CPU logical cores; GPU not available from browser). */
export const hardware = writable(
  typeof navigator !== 'undefined' ? detectHardware() : { cpuLogicalCores: 4 }
);

/** Selected model id (persisted to localStorage as 'selectedModel') */
const getStoredSelectedModel = () =>
  (typeof localStorage !== 'undefined' ? localStorage.getItem('selectedModel') : null) || '';
export const selectedModelId = writable(getStoredSelectedModel());
if (typeof localStorage !== 'undefined') {
  selectedModelId.subscribe((v) => {
    if (v) localStorage.setItem('selectedModel', v);
  });
}

/** Brief message when previous model was unavailable and we fell back (e.g. "Previous model unavailable, selected X") */
export const modelSelectionNotification = writable(null);

/** UI: sidebar open on mobile */
export const sidebarOpen = writable(false);

/** UI: settings panel open */
export const settingsOpen = writable(false);

/** LM Studio connection status: true = reachable, false = not reachable, null = unknown */
export const lmStudioConnected = writable(null);

/** UI: keyboard shortcuts help modal open */
export const shortcutsModalOpen = writable(false);

/** Confirm modal: { title, message, confirmLabel, cancelLabel, danger, resolve } or null */
export const confirmStore = writable(null);
/** Show confirmation modal; returns Promise<boolean> */
export function confirm(options) {
  return new Promise((resolve) => {
    confirmStore.set({
      title: options.title ?? 'Confirm',
      message: options.message ?? '',
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      danger: options.danger ?? false,
      resolve,
    });
  });
}

/** UI: sidebar collapsed to narrow strip on desktop. Persisted. */
export const sidebarCollapsed = writable(
  typeof localStorage !== 'undefined' && localStorage.getItem('sidebarCollapsed') === 'true'
);

/** Cockpit layout: right Intel panel open (toggle with ]). Default closed. */
export const cockpitIntelOpen = writable(false);

/** Workbench layout: pinned assistant message (markdown string or null). */
export const pinnedContent = writable(null);


/** Color scheme: default (red) | newsprint | neural | quantum | ... (see themeOptions.js) */
function getInitialUiTheme() {
  if (typeof localStorage === 'undefined') return 'default';
  const raw = localStorage.getItem('uiTheme') || 'default';
  if (raw === 'cyberpunk') {
    localStorage.setItem('uiTheme', 'default');
    return 'default';
  }
  return raw;
}
export const uiTheme = writable(getInitialUiTheme());

/** LM Studio server base URL (e.g. http://localhost:1234 or http://10.0.0.51:1234). Empty = use default. */
const getStoredLmStudioUrl = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('lmStudioBaseUrl') : null) || '';
export const lmStudioBaseUrl = writable(getStoredLmStudioUrl());
if (typeof localStorage !== 'undefined') {
  lmStudioBaseUrl.subscribe((v) => localStorage.setItem('lmStudioBaseUrl', v ?? ''));
}

/** Voice-to-text server URL (e.g. http://localhost:8765). Empty = voice mic disabled. */
const getStoredVoiceServerUrl = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('voiceServerUrl') : null) ?? 'http://localhost:8765';
export const voiceServerUrl = writable(getStoredVoiceServerUrl());
if (typeof localStorage !== 'undefined') {
  voiceServerUrl.subscribe((v) => localStorage.setItem('voiceServerUrl', v ?? ''));
}

/** Unload helper URL (Python SDK server at e.g. http://localhost:8766). When set, eject uses POST /unload-all. */
const getStoredUnloadHelperUrl = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('lmStudioUnloadHelperUrl') : null) || '';
export const lmStudioUnloadHelperUrl = writable(getStoredUnloadHelperUrl());
if (typeof localStorage !== 'undefined') {
  lmStudioUnloadHelperUrl.subscribe((v) => localStorage.setItem('lmStudioUnloadHelperUrl', v ?? ''));
}

/** DeepSeek API key (optional). When set, DeepSeek models appear in the model list and can be used for chat. Stored trimmed to avoid copy-paste spaces. */
const getStoredDeepSeekApiKey = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('deepSeekApiKey') ?? '').trim() : null) ?? '';
export const deepSeekApiKey = writable(getStoredDeepSeekApiKey());
if (typeof localStorage !== 'undefined') {
  deepSeekApiKey.subscribe((v) => localStorage.setItem('deepSeekApiKey', (typeof v === 'string' ? v : '').trim()));
}

/** Grok (xAI) API key (optional). When set, Grok models appear in the model list and can be used for chat. Stored trimmed to avoid copy-paste spaces. */
const getStoredGrokApiKey = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('grokApiKey') ?? '').trim() : null) ?? '';
export const grokApiKey = writable(getStoredGrokApiKey());
if (typeof localStorage !== 'undefined') {
  grokApiKey.subscribe((v) => localStorage.setItem('grokApiKey', (typeof v === 'string' ? v : '').trim()));
}

/** Together AI API key: used only for image generation when DeepSeek is selected (DeepSeek has no native image API). Separate endpoint from Grok. */
const getStoredTogetherApiKey = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('togetherApiKey') ?? '').trim() : null) ?? '';
export const togetherApiKey = writable(getStoredTogetherApiKey());
if (typeof localStorage !== 'undefined') {
  togetherApiKey.subscribe((v) => localStorage.setItem('togetherApiKey', (typeof v === 'string' ? v : '').trim()));
}

/** DeepInfra API key: image + video generation when DeepSeek is selected. Single key for both. */
const getStoredDeepinfraApiKey = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('deepinfraApiKey') ?? '').trim() : null) ?? '';
export const deepinfraApiKey = writable(getStoredDeepinfraApiKey());
if (typeof localStorage !== 'undefined') {
  deepinfraApiKey.subscribe((v) => localStorage.setItem('deepinfraApiKey', (typeof v === 'string' ? v : '').trim()));
}

/** Brave Search API key: web search (globe). Stored in browser, sent to search proxy. */
const getStoredBraveApiKey = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('braveApiKey') ?? '').trim() : null) ?? '';
export const braveApiKey = writable(getStoredBraveApiKey());
if (typeof localStorage !== 'undefined') {
  braveApiKey.subscribe((v) => localStorage.setItem('braveApiKey', (typeof v === 'string' ? v : '').trim()));
}

/** Together image endpoint name: required for FLUX.1-schnell-Free (create dedicated endpoint at api.together.ai, then paste the endpoint name here). */
const getStoredTogetherImageEndpoint = () => (typeof localStorage !== 'undefined' ? (localStorage.getItem('togetherImageEndpoint') ?? '').trim() : null) ?? '';
export const togetherImageEndpoint = writable(getStoredTogetherImageEndpoint());
if (typeof localStorage !== 'undefined') {
  togetherImageEndpoint.subscribe((v) => localStorage.setItem('togetherImageEndpoint', (typeof v === 'string' ? v : '').trim()));
}

/** True when at least one cloud API key (DeepSeek or Grok) is set. Used for status line when LM Studio is down. */
export const cloudApisAvailable = derived(
  [deepSeekApiKey, grokApiKey],
  ([a, b]) => !!(typeof a === 'string' && a.trim()) || !!(typeof b === 'string' && b.trim())
);

/** Layout: cockpit only (Arena removed). Old layouts migrate to cockpit. */
const OLD_TO_NEW_LAYOUT = {
  default: 'cockpit',
  flow: 'cockpit',
  splitbrain: 'cockpit',
  commandcenter: 'cockpit',
  floatingpalette: 'cockpit',
  minimal: 'cockpit',
  focus: 'cockpit',
  workbench: 'cockpit',
  nexus: 'cockpit',
};
function getInitialLayout() {
  if (typeof localStorage === 'undefined') return 'cockpit';
  const raw = localStorage.getItem('layout') || 'cockpit';
  const valid = ['cockpit'];
  const migrated = OLD_TO_NEW_LAYOUT[raw] ?? (valid.includes(raw) ? raw : 'cockpit');
  if (migrated !== raw) localStorage.setItem('layout', migrated);
  return migrated;
}
export const layout = writable(getInitialLayout());

/** Default model per system-prompt preset (General, Code, Research, Creative). Keys = preset name. */
const getPresetDefaultModels = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem('presetDefaultModels');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
export const presetDefaultModels = writable(getPresetDefaultModels());
if (typeof localStorage !== 'undefined') {
  presetDefaultModels.subscribe((obj) => {
    localStorage.setItem('presetDefaultModels', JSON.stringify(obj ?? {}));
  });
}

/** Model to use for sending chat. */
export const effectiveModelId = derived(
  [selectedModelId],
  ([$sid]) => $sid
);

/** Dark mode: 'dark' | 'light' | 'system' */
export const theme = writable(
  (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) || 'system'
);

const readBool = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  if (v == null) return fallback;
  return v === '1' || v === 'true';
};
const readNum = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Base defaults (app + generation). Used when no global or per-model override exists. */
const DEFAULT_SETTINGS = {
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: 'You are a helpful assistant.',
  top_p: 0.95,
  top_k: 64,
  repeat_penalty: 1.15,
  presence_penalty: 0,
  frequency_penalty: 0,
  stop: [],
  model_ttl_seconds: 0,
  audio_enabled: readBool('audio_enabled', true),
  audio_clicks: readBool('audio_clicks', true),
  audio_volume: readNum('audio_volume', 0.25),
  context_length: 4096,
  eval_batch_size: 512,
  flash_attention: true,
  offload_kv_cache_to_gpu: true,
  gpu_offload: 'max',
  cpu_threads: 4,
  n_parallel: 4,
};

/** Global default (single set of defaults for all models). Persisted. Migrate once from old settingsByLayout. */
function loadGlobalDefault() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem('globalDefault');
    if (raw) {
      const p = JSON.parse(raw);
      return typeof p === 'object' && p !== null ? p : {};
    }
    const byLayout = localStorage.getItem('settingsByLayout');
    if (byLayout) {
      const parsed = JSON.parse(byLayout);
      const cockpit = parsed?.cockpit ?? parsed?.default ?? parsed?.flow ?? {};
      if (typeof cockpit === 'object' && cockpit !== null && Object.keys(cockpit).length > 0) {
        return cockpit;
      }
    }
  } catch (_) {}
  return {};
}
export const globalDefault = writable(loadGlobalDefault());
if (typeof localStorage !== 'undefined') {
  globalDefault.subscribe((v) => {
    localStorage.setItem('globalDefault', JSON.stringify(v ?? {}));
  });
}

/** Per-model overrides (keyed by model id). Only stored when user explicitly saves for that model. Persisted. */
function loadPerModelOverrides() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem('perModelOverrides');
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === 'object' && p !== null ? p : {};
  } catch {
    return {};
  }
}
export const perModelOverrides = writable(loadPerModelOverrides());
if (typeof localStorage !== 'undefined') {
  perModelOverrides.subscribe((v) => {
    localStorage.setItem('perModelOverrides', JSON.stringify(v ?? {}));
  });
}

/** Update global default (used when no per-model override). */
export function updateGlobalDefault(patch) {
  globalDefault.update((g) => ({ ...g, ...patch }));
}

/** Set override for a model. Pass null for a key to clear it for that model. */
export function setPerModelOverride(modelId, patch) {
  if (!modelId) return;
  perModelOverrides.update((by) => {
    const next = { ...by };
    const current = next[modelId] ?? {};
    const merged = { ...current, ...patch };
    Object.keys(merged).forEach((k) => {
      if (merged[k] === undefined || merged[k] === '') delete merged[k];
    });
    if (Object.keys(merged).length === 0) delete next[modelId];
    else next[modelId] = merged;
    return next;
  });
}

/** Effective settings for a given model id: base <- globalDefault <- recommended <- perModelOverrides. */
export function getEffectiveSettingsForModel(modelId) {
  const g = get(globalDefault);
  const p = get(perModelOverrides);
  return mergeEffectiveSettings(modelId, g, p);
}

/** Same as getEffectiveSettingsForModel but takes g,p so components can pass reactive store values. */
export function mergeEffectiveSettings(modelId, globalDefaultVal, perModelOverridesVal) {
  const g = globalDefaultVal ?? {};
  const p = perModelOverridesVal ?? {};
  const recommended = modelId ? getRecommendedSettingsForModel(modelId) : {};
  const overrides = modelId ? (p[modelId] ?? {}) : {};
  return { ...DEFAULT_SETTINGS, ...g, ...recommended, ...overrides };
}

/** Effective settings for the currently selected model. Reactive. */
export const settings = derived(
  [globalDefault, perModelOverrides, selectedModelId],
  ([$g, $p, $sid]) => getEffectiveSettingsForModel($sid || '')
);

/** @deprecated Use updateGlobalDefault() or setPerModelOverride(). Kept for compatibility; writes global default. */
export function updateSettings(patch) {
  updateGlobalDefault(patch);
}

/** Whether we're currently streaming a response */
export const isStreaming = writable(false);

/**
 * AI Lab diagnostics overlay: runtime metrics. Single writer = stream reporter only.
 * Throttled updates (max 100ms) during stream; start/end events outside throttle.
 * liveChunks = count of onChunk calls (text deltas); lastTotalTokens = API usage.completion_tokens when available.
 * @type {import('svelte/store').Writable<{ isStreaming: boolean, liveChunks: number, liveChunksPerSec: number, lastLatencyMs: number | null, lastTokenAt: number | null, lastTotalTokens: number | null, temperature: number | null }>}
 */
export const themeMetrics = writable({
  isStreaming: false,
  liveChunks: 0,
  liveChunksPerSec: 0,
  lastLatencyMs: null,
  lastTokenAt: null,
  lastTotalTokens: null,
  temperature: null,
});

/** Error message to show near chat input (e.g. API or model error) */
export const chatError = writable(null);
/** One-shot chat command (regen/export/clear). ChatView subscribes and handles. */
export const chatCommand = writable(null);

/** When true, the next Send will run a web search (DuckDuckGo) with the message text, then send. Toggle via globe button. */
export const webSearchForNextMessage = writable(false);

/** True while a web search is in progress (DuckDuckGo fetch). Show "Searching the web..." UI. */
export const webSearchInProgress = writable(false);

/** True only after a web search or warm-up fetch has succeeded. Drives the green dot on the globe – do not set true without a real successful fetch. */
export const webSearchConnected = writable(false);

/** Last response tokens (set when a response completes). */
export const lastResponseTokens = writable(null);
/** Live token estimate while streaming (approx, resets after stream ends) */
export const liveTokens = writable(null);
/** Live tokens/sec estimate (approx). */
export const liveTokPerSec = writable(null);

/** Integrated terminal panel: open (toggle with Ctrl+`). */
export const terminalOpen = writable(
  typeof localStorage !== 'undefined' ? localStorage.getItem('terminalOpen') !== 'false' : true
);
if (typeof localStorage !== 'undefined') {
  terminalOpen.subscribe((v) => localStorage.setItem('terminalOpen', v ? 'true' : 'false'));
}

/** Terminal panel height in px (resizable; min 100, default 250). */
export const terminalHeight = writable(
  typeof localStorage !== 'undefined' ? Number(localStorage.getItem('terminalHeight')) || 250 : 250
);
if (typeof localStorage !== 'undefined') {
  terminalHeight.subscribe((v) => localStorage.setItem('terminalHeight', String(v)));
}

/** Terminal WebSocket URL (e.g. ws://localhost:8767). */
export const terminalServerUrl = writable(
  typeof localStorage !== 'undefined' ? localStorage.getItem('terminalServerUrl') || 'ws://localhost:8767' : 'ws://localhost:8767'
);
if (typeof localStorage !== 'undefined') {
  terminalServerUrl.subscribe((v) => localStorage.setItem('terminalServerUrl', v ?? ''));
}

/** One-shot: when set, TerminalPanel writes this to the pty then clears. Used by "Run in Terminal" from code blocks. */
export const terminalCommand = writable(null);

/** Diff viewer state: { originalCode, modifiedCode, filePath } or null. When set, App renders DiffViewer. */
export const diffViewerState = writable(null);

/** Workspace root path for file explorer (e.g. /home/user/project). */
export const workspaceRoot = writable(
  typeof localStorage !== 'undefined' ? localStorage.getItem('workspaceRoot') || '' : ''
);
if (typeof localStorage !== 'undefined') {
  workspaceRoot.subscribe((v) => localStorage.setItem('workspaceRoot', v ?? ''));
}

/** File server base URL (e.g. http://localhost:8768). */
export const fileServerUrl = writable(
  typeof localStorage !== 'undefined' ? localStorage.getItem('fileServerUrl') || 'http://localhost:8768' : 'http://localhost:8768'
);
if (typeof localStorage !== 'undefined') {
  fileServerUrl.subscribe((v) => localStorage.setItem('fileServerUrl', v ?? ''));
}

/** File paths pinned as always-include context when sending messages. */
export const pinnedFiles = writable(
  typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('pinnedFiles') || '[]') : []
);
if (typeof localStorage !== 'undefined') {
  pinnedFiles.subscribe((v) => localStorage.setItem('pinnedFiles', JSON.stringify(v ?? [])));
}

/** File explorer panel open (toggle with Ctrl+E). */
export const fileExplorerOpen = writable(
  typeof localStorage !== 'undefined' ? localStorage.getItem('fileExplorerOpen') === 'true' : false
);
if (typeof localStorage !== 'undefined') {
  fileExplorerOpen.subscribe((v) => localStorage.setItem('fileExplorerOpen', v ? 'true' : 'false'));
}

/** When set to a string, ChatInput sets its value to it and focuses (then clears). Used by QuickActions. */
export const chatInputPrefill = writable(/** @type {string | null} */ (null));

/** Context usage for the current conversation: { promptTokens, contextMax }. Updated from stream usage and from last message when switching conv. Used by ContextRing. */
export const contextUsage = writable({ promptTokens: 0, contextMax: 128000 });

/** Increment to request "Summarize and continue". ChatView reacts and runs the flow, then resets context. */
export const summarizeAndContinueTrigger = writable(0);

/** Floating metrics dashboard: open, minimized, position { x, y }, size { width, height }. */
function getFloatingMetricsState() {
  if (typeof localStorage === 'undefined') return { open: true, minimized: false, x: 24, y: 24, width: 220, height: 260 };
  try {
    const raw = localStorage.getItem('floatingMetrics');
    if (!raw) return { open: true, minimized: false, x: 24, y: 24, width: 220, height: 260 };
    const p = JSON.parse(raw);
    const w = Number(p.width);
    const h = Number(p.height);
    return {
      open: p.open !== false,
      minimized: !!p.minimized,
      x: Number(p.x) || 24,
      y: Number(p.y) || 24,
      width: (w >= 200 && w <= 500) ? w : 220,
      height: (h >= 160 && h <= 420) ? h : 260,
    };
  } catch {
    return { open: true, minimized: false, x: 24, y: 24, width: 220, height: 260 };
  }
}
const floatingInit = getFloatingMetricsState();
export const floatingMetricsOpen = writable(floatingInit.open);
export const floatingMetricsMinimized = writable(floatingInit.minimized);
export const floatingMetricsPosition = writable({ x: floatingInit.x, y: floatingInit.y });
export const floatingMetricsSize = writable({ width: floatingInit.width, height: floatingInit.height });
if (typeof localStorage !== 'undefined') {
  function saveFloatingMetrics() {
    const open = get(floatingMetricsOpen);
    const min = get(floatingMetricsMinimized);
    const pos = get(floatingMetricsPosition);
    const sz = get(floatingMetricsSize);
    localStorage.setItem('floatingMetrics', JSON.stringify({ open, minimized: min, x: pos.x, y: pos.y, width: sz.width, height: sz.height }));
  }
  floatingMetricsOpen.subscribe(saveFloatingMetrics);
  floatingMetricsMinimized.subscribe(saveFloatingMetrics);
  floatingMetricsPosition.subscribe(saveFloatingMetrics);
  floatingMetricsSize.subscribe(saveFloatingMetrics);
}

export function pushTokSample(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return;
  liveTokPerSec.set(r);
}
