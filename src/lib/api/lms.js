/**
 * @file lms.js
 * @description LM Studio SDK integration and local model resolution.
 */
import { LMStudioClient } from '@lmstudio/sdk';
import { get } from 'svelte/store';
import { lmStudioBaseUrl } from '$lib/stores.js';

let lmsClient = null;
let lmsClientBaseUrl = null;

/**
 * Convert an http/https URL to ws/wss as required by the LM Studio SDK.
 * e.g. "http://localhost:1234" → "ws://localhost:1234"
 * @param {string} url
 * @returns {string}
 */
function toWsUrl(url) {
    return (url || 'http://localhost:1234')
        .replace(/^http:\/\//i, 'ws://')
        .replace(/^https:\/\//i, 'wss://');
}

/**
 * Get or create LM Studio SDK client. Rebuilds if the base URL has changed.
 * @returns {LMStudioClient}
 */
export function getLMStudioClient() {
    const rawBase = get(lmStudioBaseUrl) || 'http://localhost:1234';
    const wsBase = toWsUrl(rawBase);
    // Invalidate singleton if the URL changed since last init
    if (!lmsClient || lmsClientBaseUrl !== wsBase) {
        lmsClient = new LMStudioClient({ baseUrl: wsBase });
        lmsClientBaseUrl = wsBase;
    }
    return lmsClient;
}

/**
 * Resolve human-readable model id to LM Studio internal identifier.
 * More robust: tries exact match, then substring match, then first loaded.
 * @param {LMStudioClient} client
 * @param {string} modelId
 * @returns {Promise<string>}
 */
export async function resolveLMSModelId(client, modelId) {
    if (!modelId) throw new Error('No model selected');

    // Clean potential prefixes if mistakenly passed here
    const cleanId = String(modelId).replace(/^(lms|local):/, '');

    const lmsModels = await client.llm.listLoaded();
    if (lmsModels.length === 0) throw new Error('No models loaded in LM Studio. Please load one first.');

    // 1. Exact match
    const exact = lmsModels.find(m => m.identifier === cleanId || m.path === cleanId);
    if (exact) return exact.identifier;

    // 2. Substring match (e.g. "gemma" matches "google/gemma-2b-it")
    const partial = lmsModels.find(m =>
        m.identifier.toLowerCase().includes(cleanId.toLowerCase()) ||
        m.path.toLowerCase().includes(cleanId.toLowerCase())
    );
    if (partial) return partial.identifier;

    // 3. Fallback to first loaded model (best effort)
    return lmsModels[0].identifier;
}
