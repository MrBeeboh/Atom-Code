/**
 * @file transport.js
 * @description Generic SEE/Fetch transport for OpenAI-compatible streaming APIs.
 */
import { parseChatApiError } from './common.js';

/**
 * @param {string} url
 * @param {object} headers
 * @param {object} body
 * @param {AbortSignal} [signal]
 * @param {(c: string) => void} onChunk
 * @param {(u: any) => void} [onUsage]
 * @param {() => void} [onDone]
 * @param {string} model - For error reporting
 */
export async function streamHttpSse(url, headers, body, model, onChunk, signal, onUsage, onDone) {
    let doneCalled = false;
    const callOnDone = () => {
        if (!doneCalled) {
            doneCalled = true;
            onDone?.();
        }
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(parseChatApiError(res.status, text, model));
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    // Flush remaining buffer
                    buffer += decoder.decode(new Uint8Array(), { stream: false });
                    processBuffer(buffer, onChunk, onUsage, callOnDone);
                    callOnDone();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                buffer = processBuffer(buffer, onChunk, onUsage, callOnDone);
            }
        } finally {
            reader.releaseLock();
        }
    } catch (err) {
        if (err.name === 'AbortError') return { aborted: true };
        throw err;
    }
}

/**
 * Process raw SSE buffer and return any remaining partial line.
 */
function processBuffer(buffer, onChunk, onUsage, callOnDone) {
    const lines = buffer.split('\n');
    const remaining = lines.pop() ?? '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data: ')) {
            // Some providers send non-data lines (comments or heartbeats)
            continue;
        }

        const payload = trimmed.slice(6).trim();
        if (payload === '[DONE]') {
            callOnDone();
            continue;
        }

        try {
            const parsed = JSON.parse(payload);
            const choice = parsed.choices?.[0];

            // Handle delta content
            if (choice?.delta?.content) {
                onChunk(choice.delta.content);
            }

            // Handle finish reason
            if (choice?.finish_reason != null) {
                // We keep going if there's more data (some providers split usage into a final chunk)
            }

            // Handle usage
            if (parsed.usage) {
                onUsage?.(parsed.usage);
            }
        } catch (e) {
            // Ignore malformed JSON chunks in the stream
            console.warn('[transport] SSE parse error:', e.message, 'Payload:', payload.slice(0, 50));
        }
    }
    return remaining;
}
