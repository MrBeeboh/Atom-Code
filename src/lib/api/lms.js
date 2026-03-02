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
 * @param {LMStudioClient} client
 * @param {string} modelId
 * @returns {Promise<string>}
 */
export async function resolveLMSModelId(client, modelId) {
    if (!modelId) throw new Error('No model selected');
    const lmsModels = await client.llm.listLoaded();
    const found = lmsModels.find(m => m.identifier === modelId || m.path === modelId);
    if (found) return found.identifier;
    if (lmsModels.length > 0) return lmsModels[0].identifier;
    throw new Error('No models loaded in LM Studio');
}
