/**
 * @file grok.js
 * @description Grok-specific streaming via xAI standard Chat Completions API.
 * Uses OpenAI-compatible endpoint for maximum stability ("once and for all").
 */
import { get } from 'svelte/store';
import { grokApiKey } from '$lib/stores.js';
import {
    XAI_RESPONSES_BASE,
    CLOUD_REQUEST_TIMEOUT_MS,
    parseChatApiError,
    resolveModelId,
} from "./common.js";

/** Regex to extract <render_searched_image image_id="..." size="..."> from stream deltas. */
const GROK_RENDER_IMAGE_RE =
    /<render_searched_image\s+image_id=["']?([^"'\s>]+)["']?(?:\s+size=["']?([^"'\s>]*)["']?)?\s*\/?>/gi;

/**
 * @param {import('./types').StreamParams} params
 */
export async function streamGrokResponsesApi({
    model,
    messages,
    options = {},
    onChunk,
    onUsage,
    onDone,
    onImageRef,
    signal,
}) {
    const apiKey = options.apiKey || (get(grokApiKey)); // Fallback if not injected
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
    };

    const resolvedModel = resolveModelId(model);

    const body = {
        model: resolvedModel || "grok-beta",
        messages,
        stream: true,
        temperature: options.temperature ?? 0,
        max_tokens: options.max_tokens ?? 4096,
        web_search: true, // Native search support
    };

    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(
        () => timeoutCtrl.abort(),
        CLOUD_REQUEST_TIMEOUT_MS,
    );

    const onAbort = () => {
        clearTimeout(timeoutId);
        timeoutCtrl.abort();
    };

    if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort);
    }

    try {
        const res = await fetch(`${XAI_RESPONSES_BASE}/chat/completions`, {
            method: "POST",
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
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: ")) continue;
                const payload = trimmed.slice(6);
                if (payload === "[DONE]") break;

                try {
                    const parsed = JSON.parse(payload);
                    let delta = parsed.choices?.[0]?.delta?.content || "";

                    // xAI might occasionally send special tags in search results
                    if (delta.includes("<render_searched_image")) {
                        delta = delta.replace(GROK_RENDER_IMAGE_RE, (match, image_id) => {
                            if (onImageRef) onImageRef({ image_id });
                            return ""; // Strip from visible text
                        });
                    }

                    if (delta) onChunk(delta);
                    if (parsed.usage) onUsage?.(parsed.usage);
                } catch (_) { }
            }
        }
        onDone?.();
    } catch (err) {
        if (err.name === "AbortError") return { aborted: true };
        throw err;
    } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener("abort", onAbort);
    }
}
