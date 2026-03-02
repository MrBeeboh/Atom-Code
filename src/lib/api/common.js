/**
 * @file common.js
 * @description API base URLs, auth helpers, and error parsing shared across providers.
 */
import { getKey } from '../secureKeys.js';

export const CLOUD_REQUEST_TIMEOUT_MS = 60000;
export const XAI_RESPONSES_BASE = 'https://api.x.ai/v1';

/**
 * Resolve external API base URL and authorization headers based on model name.
 * @param {string} model - e.g. "deepseek:deepseek-chat" or "grok:grok-beta".
 * @param {string} [apiKeyOverride] - Optional API key to override the store.
 * @returns {Promise<{ base: string, headers: object }>}
 */
export async function getBaseAndAuth(model, apiKeyOverride) {
    const parts = String(model).split(':');
    const provider = parts[0];

    if (provider === 'deepseek') {
        const key = apiKeyOverride || await getKey('deepSeekApiKey');
        return {
            base: 'https://api.deepseek.com',
            headers: { Authorization: `Bearer ${key}` },
        };
    }
    if (provider === 'grok') {
        const key = apiKeyOverride || await getKey('grokApiKey');
        return {
            base: 'https://api.x.ai/v1',
            headers: { Authorization: `Bearer ${key}` },
        };
    }
    if (provider === 'together') {
        const key = apiKeyOverride || await getKey('togetherApiKey');
        return {
            base: 'https://api.together.xyz',
            headers: { Authorization: `Bearer ${key}` },
        };
    }
    if (provider === 'deepinfra') {
        const key = apiKeyOverride || await getKey('deepinfraApiKey');
        return {
            base: 'https://api.deepinfra.com/v1/openai',
            headers: { Authorization: `Bearer ${key}` },
        };
    }
    return { base: '', headers: {} };
}

/**
 * Strip provider prefix from model name.
 * @param {string} model - e.g. "deepseek:deepseek-chat"
 * @returns {string} - e.g. "deepseek-chat"
 */
export function resolveModelId(model) {
    if (!model) return '';
    const s = String(model);
    return s.includes(':') ? s.split(':')[1] : s;
}

/**
 * Common error parser for cloud APIs.
 * @param {number} status
 * @param {string} text
 * @param {string} model
 * @returns {string} - Human-readable error message.
 */
export function parseChatApiError(status, text, model) {
    let detail = text;
    try {
        const json = JSON.parse(text);
        detail = json.error?.message || json.message || text;
    } catch (_) { }

    if (status === 401) return `Invalid API Key for ${model}. Please check your settings.`;
    if (status === 404) return `Model ${model} not found or endpoint incorrect.`;
    if (status === 429) return `Rate limit exceeded for ${model}. Try again in a few seconds.`;
    return `API Error (${status}): ${detail}`;
}

/**
 * Check if a model id belongs to a cloud provider.
 * @param {string} model
 * @returns {boolean}
 */
export function isCloudModel(model) {
    if (!model) return false;
    const s = String(model);
    return s.includes(':') && (s.startsWith('deepseek:') || s.startsWith('grok:') || s.startsWith('together:') || s.startsWith('deepinfra:'));
}

/**
 * Check if the model is a Grok (xAI) model.
 * @param {string} model
 * @returns {boolean}
 */
export function isGrokModel(model) {
    return String(model).startsWith('grok:');
}

/**
 * Check if the model is a DeepSeek model.
 * @param {string} model
 * @returns {boolean}
 */
export function isDeepSeekModel(model) {
    return String(model).startsWith('deepseek:');
}
