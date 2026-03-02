/**
 * @file api.js
 * @description Modular API orchestrator for ATOM Code.
 * Routes requests to specialized modules (LMS, Grok, Cloud) and handles media generation.
 */

import { get } from 'svelte/store';
import {
  lmStudioBaseUrl,
  togetherImageEndpoint,
} from '$lib/stores.js';

// Internal modules
import {
  isCloudModel,
  isGrokModel,
  isDeepSeekModel,
  getBaseAndAuth,
  resolveModelId,
  parseChatApiError,
  CLOUD_REQUEST_TIMEOUT_MS
} from './api/common.js';
import { streamGrokResponsesApi } from './api/grok.js';
import { streamHttpSse } from './api/transport.js';
import { getLMStudioClient, resolveLMSModelId } from './api/lms.js';

// Re-export common helpers for convenience
export { isCloudModel as isCloud, isGrokModel, isDeepSeekModel, getBaseAndAuth, parseChatApiError, resolveModelId };

/**
 * Get human-readable display name for a model.
 * @param {string} modelId
 * @returns {string}
 */
export function modelDisplayName(modelId) {
  if (!modelId) return '';
  const id = resolveModelId(modelId);
  return id
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get a short type/provider tag for a model (e.g. 'DeepSeek', 'Grok', 'Together').
 * Returns empty string for local LM Studio models.
 * @param {string} modelId
 * @returns {string}
 */
export function getModelTypeTag(modelId) {
  if (!modelId) return '';
  const s = String(modelId);
  if (s.startsWith('deepseek:')) return 'DeepSeek';
  if (s.startsWith('grok:')) return 'Grok';
  if (s.startsWith('together:')) return 'Together';
  if (s.startsWith('deepinfra:')) return 'DeepInfra';
  return '';
}

/**
 * Fetch available models from local LM Studio.
 * @returns {Promise<object[]>}
 */
export async function getModels() {
  const base = get(lmStudioBaseUrl) || 'http://localhost:1234';
  const url = `${base}/v1/models`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Load a model in LM Studio via the management API (v0).
 * @param {string} modelId - The model key to load (e.g. "medgemma-1.5-4b-it@q4_k_s").
 * @param {object} [loadConfig] - Optional load configuration.
 * @param {number} [loadConfig.context_length]
 * @param {number} [loadConfig.eval_batch_size]
 * @param {boolean} [loadConfig.flash_attention]
 * @param {boolean} [loadConfig.offload_kv_cache_to_gpu]
 * @param {number} [loadConfig.ttl]
 * @returns {Promise<void>}
 */
export async function loadModel(modelId, loadConfig = {}) {
  if (!modelId) throw new Error('No model specified');
  const base = get(lmStudioBaseUrl) || 'http://localhost:1234';
  // LM Studio management API v0 for loading models
  const url = `${base}/api/v0/models/load`;
  const body = {
    model: modelId,  // LM Studio expects 'model', not 'identifier'
    ...(loadConfig.context_length != null && { contextLength: loadConfig.context_length }),
    ...(loadConfig.eval_batch_size != null && { evalBatchSize: loadConfig.eval_batch_size }),
    ...(loadConfig.flash_attention != null && { flashAttention: loadConfig.flash_attention }),
    ...(loadConfig.offload_kv_cache_to_gpu != null && { offloadKvCacheToGpu: loadConfig.offload_kv_cache_to_gpu }),
    ...(loadConfig.ttl != null && { ttl: loadConfig.ttl }),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch (_) { }
    throw new Error(`Failed to load model: ${res.status} — ${detail}`);
  }
}


/**
 * Check if local LM Studio is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkLmStudioConnection() {
  const base = get(lmStudioBaseUrl) || 'http://localhost:1234';
  try {
    const res = await fetch(`${base}/v1/models`, { method: 'HEAD' }).catch(() => fetch(`${base}/v1/models`));
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Single-shot chat completion (non-streaming).
 * @param {string} model - Model identifier.
 * @param {object[]} messages - Chat messages.
 * @param {import('./api/types').ChatOptions} [options] - Generation options.
 * @returns {Promise<{ content: string, usage?: object }>}
 */
export async function requestChatCompletion(model, messages, options = {}) {
  const isCloud = isCloudModel(model);
  let base, authHeaders, resolvedModel;

  if (isCloud) {
    const r = await getBaseAndAuth(model);
    base = r.base;
    authHeaders = r.headers;
    resolvedModel = resolveModelId(model);
  } else {
    // For local models, we use the stored base URL or default
    base = get(lmStudioBaseUrl) || 'http://localhost:1234';
    if (!base.endsWith('/v1')) base += '/v1';
    authHeaders = {};
    const client = getLMStudioClient();
    resolvedModel = await resolveLMSModelId(client, model);
  }

  const url = base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const headers = { 'Content-Type': 'application/json', ...authHeaders };
  const rawMax = options.max_tokens ?? 1024;
  const maxTokens = Math.max(1, Math.min(8192, Number(rawMax) || 1024));

  const body = {
    model: resolvedModel,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.3,
    max_tokens: maxTokens,
    ...(options.top_p != null && { top_p: options.top_p }),
    ...(options.top_k != null && { top_k: options.top_k }),
  };

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), CLOUD_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseChatApiError(res.status, text, model));
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return { content: String(content).trim(), usage: data.usage };
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/**
 * Orchestrator for streaming chat completions.
 * @param {import('./api/types').StreamParams} params
 * @returns {Promise<{ usage?: object, elapsedMs: number, aborted?: boolean }>}
 */
export async function streamChatCompletion({ model, messages, options = {}, onChunk, onUsage, onDone, onImageRef, signal }) {
  const isCloud = isCloudModel(model);
  const startTime = Date.now();
  let doneCalled = false;
  const callOnDone = () => {
    if (!doneCalled) {
      doneCalled = true;
      onDone?.();
    }
  };

  // 1. Grok-specific Responses API (web search)
  if (isGrokModel(model)) {
    const apiKeys = await getBaseAndAuth(model);
    const result = await streamGrokResponsesApi({
      model,
      messages,
      options: { ...options, apiKey: apiKeys.headers.Authorization?.split(' ')[1] },
      onChunk, onUsage, onDone, onImageRef, signal
    });
    return { ...result, elapsedMs: Date.now() - startTime };
  }

  // 2. Local Vision/PDF path (SSE via HTTP)
  const hasImageContent = Array.isArray(messages) && messages.some(
    m => Array.isArray(m.content) && m.content.some(c => c?.type === 'image_url')
  );

  // 3. Local Model via SDK (Standard Chat)
  if (!isCloud && !hasImageContent) {
    const client = getLMStudioClient();
    let onAbortToken = null;
    try {
      const identifier = await resolveLMSModelId(client, model);
      const lmsModel = await client.llm.model(identifier);
      const stream = lmsModel.respond(messages, {
        temperature: options.temperature,
        // The SDK uses maxTokens for prediction limit
        maxTokens: options.max_tokens,
        stopStrings: options.stop,
      });

      onAbortToken = () => stream.cancel();
      if (signal) {
        if (signal.aborted) onAbortToken();
        else signal.addEventListener('abort', onAbortToken);
      }

      for await (const chunk of stream) {
        if (chunk.content) onChunk(chunk.content);
      }

      // After the for-await loop, the OngoingPrediction is complete.
      // Call .result() to get stats without re-consuming the stream.
      let usageParams = { prompt_tokens: undefined, completion_tokens: undefined };
      try {
        const result = await stream.result();
        usageParams = {
          prompt_tokens: result?.stats?.promptTokensCount,
          completion_tokens: result?.stats?.predictedTokensCount,
        };
      } catch (_) {
        // Stats not critical; continue even if unavailable
      }
      onUsage?.(usageParams);
      if (signal && onAbortToken) signal.removeEventListener('abort', onAbortToken);
      callOnDone();
      return { usage: usageParams, elapsedMs: Date.now() - startTime };
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        if (signal && onAbortToken) signal.removeEventListener('abort', onAbortToken);
        callOnDone();
        return { usage: {}, elapsedMs: Date.now() - startTime, aborted: true };
      }
      if (signal && onAbortToken) signal.removeEventListener('abort', onAbortToken);
      callOnDone();
      const msg = (err instanceof Error ? err.message : String(err)) || 'Unknown LM Studio error';
      throw new Error(`LM Studio Stream Error: ${msg}`);
    }
  }

  // 4. Cloud Models OR Local Vision (SSE via HTTP)
  let streamBase, resolvedModel, authHeaders;
  if (isCloud) {
    const r = await getBaseAndAuth(model);
    streamBase = r.base;
    authHeaders = r.headers;
    resolvedModel = resolveModelId(model);
  } else {
    streamBase = get(lmStudioBaseUrl) || 'http://localhost:1234';
    if (!streamBase.endsWith('/v1')) streamBase += '/v1';
    authHeaders = {};
    resolvedModel = model;
  }

  const streamUrl = streamBase.includes('/v1') ? `${streamBase}/chat/completions` : `${streamBase}/v1/chat/completions`;
  const headers = { 'Content-Type': 'application/json', ...authHeaders };
  const rawMax = options.max_tokens ?? 4096;
  const maxTokens = Math.max(1, Math.min(8192, Number(rawMax) || 4096));
  const streamBody = {
    model: resolvedModel,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    max_tokens: maxTokens,
    ...(options.top_p != null && { top_p: options.top_p }),
    ...(options.top_k != null && { top_k: options.top_k }),
  };

  const timeoutCtrl = new AbortController();
  const toId = setTimeout(() => timeoutCtrl.abort(), CLOUD_REQUEST_TIMEOUT_MS);

  const onSseAbort = () => {
    clearTimeout(toId);
    timeoutCtrl.abort();
  };

  if (signal) {
    if (signal.aborted) onSseAbort();
    else signal.addEventListener('abort', onSseAbort);
  }

  try {
    const res = await streamHttpSse(streamUrl, headers, streamBody, model, onChunk, timeoutCtrl.signal, onUsage, callOnDone);
    if (toId) clearTimeout(toId);
    if (signal) signal.removeEventListener('abort', onSseAbort);
    return { usage: res?.usage, elapsedMs: Date.now() - startTime, aborted: res?.aborted };
  } catch (err) {
    if (toId) clearTimeout(toId);
    if (signal) signal.removeEventListener('abort', onSseAbort);
    throw err;
  }
}
const DEEPINFRA_INFERENCE_BASE = 'https://api.deepinfra.com/v1/inference';

/**
 * Text-to-image via DeepInfra. Synchronous; returns base64 in response.images[0].
 * @param {{ apiKey: string, modelId: string, prompt: string, num_images?: number, num_inference_steps?: number, guidance_scale?: number, width?: number, height?: number, negative_prompt?: string }} opts
 * @returns {Promise<{ data: Array<{ url: string }> }>} data[].url are data URLs (data:image/png;base64,...) for display
 */
export async function requestDeepInfraImageGeneration({
  apiKey,
  modelId,
  prompt,
  num_images = 1,
  num_inference_steps = 30,
  guidance_scale = 7.5,
  width = 1024,
  height = 1024,
  negative_prompt,
}) {
  const key = (apiKey || '').trim();
  if (!key) throw new Error('DeepInfra API key required. Add it in Settings → Cloud APIs.');
  const body = {
    prompt: String(prompt).trim(),
    num_images: Math.max(1, Math.min(4, Number(num_images) || 1)),
    num_inference_steps: Math.max(1, Math.min(50, Number(num_inference_steps) || 30)),
    guidance_scale: Number(guidance_scale) || 7.5,
    width: Math.max(128, Math.min(1024, Number(width) || 1024)),
    height: Math.max(128, Math.min(1024, Number(height) || 1024)),
  };
  if (negative_prompt != null && String(negative_prompt).trim() !== '') body.negative_prompt = String(negative_prompt).trim();
  const url = `${DEEPINFRA_INFERENCE_BASE}/${encodeURIComponent(modelId)}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), CLOUD_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.detail?.error || data?.detail || JSON.stringify(data) || res.statusText;
      throw new Error(parseChatApiError(res.status, msg, 'deepinfra:image'));
    }
    const rawImages = data?.images ?? data?.result?.images ?? [];
    const images = Array.isArray(rawImages) ? rawImages : [];
    if (images.length === 0) throw new Error('DeepInfra image response had no images.');
    const urls = images.map((item) => {
      if (typeof item === 'string') {
        if (item.startsWith('data:') || item.startsWith('http://') || item.startsWith('https://')) return item;
        return `data:image/png;base64,${item}`;
      }
      if (item && typeof item === 'object' && typeof item.url === 'string') return item.url;
      return null;
    }).filter(Boolean);
    if (urls.length === 0) throw new Error('DeepInfra image response had no images.');
    return { data: urls.map((url) => ({ url })) };
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/**
 * Text-to-video via DeepInfra. Synchronous; returns relative path in response.video_url or response.videos. Full URL = base + path.
 * CRITICAL (DeepInfra docs): Video models accept ONLY the "prompt" field. ANY other field (width, height, duration, negative_prompt, etc.) causes "signal aborted without reason". Do not add or spread any options here.
 * @param {{ apiKey: string, modelId: string, prompt: string }} opts
 * @returns {Promise<{ videoUrl: string }>}
 */
export async function requestDeepInfraVideoGeneration({ apiKey, modelId, prompt }) {
  const key = (apiKey || '').trim();
  if (!key) throw new Error('DeepInfra API key required. Add it in Settings → Cloud APIs.');
  const promptOnly = String(prompt ?? '').trim();
  const url = `${DEEPINFRA_INFERENCE_BASE}/${modelId}`;
  const VIDEO_TIMEOUT_MS = 1200000; // 20 minutes
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), VIDEO_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ prompt: promptOnly }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.detail?.error || data?.detail || JSON.stringify(data) || res.statusText;
      throw new Error(parseChatApiError(res.status, msg, 'deepinfra:video'));
    }
    const candidates = [
      data?.video_url, data?.videos, data?.video, data?.output, data?.url,
      data?.result?.video_url, data?.result?.videos, data?.result?.video, data?.result?.output, data?.result?.url,
    ];
    let pathStr = null;
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) { pathStr = c.trim(); break; }
      if (Array.isArray(c) && c.length > 0) {
        const first = typeof c[0] === 'string' ? c[0] : c[0]?.url ?? c[0]?.video_url ?? null;
        if (typeof first === 'string' && first.trim()) { pathStr = first.trim(); break; }
      }
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        const inner = c.url ?? c.video_url ?? c.video ?? null;
        if (typeof inner === 'string' && inner.trim()) { pathStr = inner.trim(); break; }
      }
    }
    if (!pathStr) throw new Error(`DeepInfra video: unexpected response shape. Keys: ${Object.keys(data || {}).join(', ')}`);
    const fullVideoUrl =
      pathStr.startsWith('data:') || pathStr.startsWith('http://') || pathStr.startsWith('https://')
        ? pathStr
        : `https://api.deepinfra.com${pathStr.startsWith('/') ? pathStr : `/${pathStr}`}`;
    return { videoUrl: fullVideoUrl };
  } catch (err) {
    clearTimeout(to);
    if (err?.name === 'AbortError') {
      throw new Error(`Video generation timed out after ${VIDEO_TIMEOUT_MS / 60000} minutes. Try again or use a shorter prompt.`);
    }
    throw err;
  }
}

/**
 * Fetch hardware metrics from Python bridge.
 * @returns {Promise<object|null>}
 */
export async function fetchHardwareMetrics() {
  const custom = typeof localStorage !== 'undefined' ? localStorage.getItem('hardwareMetricsUrl') : null;
  const base = (custom || 'http://localhost:5000').replace(/\/$/, '');
  const url = `${base}/metrics`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(t);
    return null;
  }
}
