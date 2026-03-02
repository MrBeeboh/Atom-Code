/**
 * @typedef {object} ChatOptions
 * @property {number} [temperature]
 * @property {number} [max_tokens]
 * @property {number} [context_length]
 * @property {number} [top_p]
 * @property {number} [top_k]
 * @property {number} [repeat_penalty]
 * @property {number} [presence_penalty]
 * @property {number} [frequency_penalty]
 * @property {number} [model_ttl_seconds]
 * @property {string[]} [stop]
 */

/**
 * @typedef {object} StreamParams
 * @property {string} model
 * @property {object[]} messages
 * @property {ChatOptions & { apiKey?: string }} [options]
 * @property {(chunk: string) => void} onChunk
 * @property {(usage: object) => void} [onUsage]
 * @property {() => void} [onDone]
 * @property {(ref: { image_id: string }) => void} [onImageRef]
 * @property {AbortSignal} [signal]
 */

export { };
