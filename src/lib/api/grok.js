/**
 * @file grok.js
 * @description Grok-specific streaming via xAI Responses API.
 */
import { XAI_RESPONSES_BASE, CLOUD_REQUEST_TIMEOUT_MS, parseChatApiError } from './common.js';

/** Regex to extract <render_searched_image image_id="..." size="..."> from stream deltas. */
const GROK_RENDER_IMAGE_RE = /<render_searched_image\s+image_id=["']?([^"'\s>]+)["']?(?:\s+size=["']?([^"'\s>]*)["']?)?\s*\/?>/gi;

/**
 * @param {import('./types').StreamParams} params
 */
export async function streamGrokResponsesApi({ model, messages, options = {}, onChunk, onUsage, onDone, onImageRef, signal }) {
    const apiKey = options.apiKey; // Passed from caller or retrieved via common
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };

    const body = {
        model: 'grok-beta', // Responses API currently uses this or similar
        messages,
        stream: true,
        temperature: options.temperature ?? 0,
        max_tokens: options.max_tokens ?? 4096,
        web_search: true,
        x_search: true,
        enable_image_understanding: true,
    };

    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), CLOUD_REQUEST_TIMEOUT_MS);

    const onAbort = () => {
        clearTimeout(timeoutId);
        timeoutCtrl.abort();
    };

    if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort);
    }

    try {
        const res = await fetch(`${XAI_RESPONSES_BASE}/responses`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: timeoutCtrl.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!res.ok) {
            const text = await res.text();
            throw new Error(parseChatApiError(res.status, text, model));
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const payload = trimmed.slice(6);
                if (payload === '[DONE]') break;

                try {
                    const parsed = JSON.parse(payload);
                    let delta = parsed.choices?.[0]?.delta?.content || '';

                    // Grok search image tags
                    if (delta.includes('<render_searched_image')) {
                        delta = delta.replace(GROK_RENDER_IMAGE_RE, (match, image_id) => {
                            if (onImageRef) onImageRef({ image_id });
                            return ''; // Strip from visible text
                        });
                    }

                    if (delta) onChunk(delta);
                    if (parsed.usage) onUsage?.(parsed.usage);
                } catch (_) { }
            }
        }
        onDone?.();
    } catch (err) {
        if (err.name === 'AbortError') return { aborted: true };
        throw err;
    } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
}
