# LM Studio Developer Reference

Single-source reference from [LM Studio Developer Docs](https://lmstudio.ai/docs/developer). Use this for correct API usage, load/unload behavior, and teaching.

---

## Stack overview

- **Native REST API** — `/api/v1/*` (v1, recommended; v0 is legacy)
- **OpenAI-compatible** — `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`, `/v1/models`, `/v1/completions`
- **Anthropic-compatible** — `/v1/messages`
- **SDKs** — lmstudio-js (TypeScript), lmstudio-python, CLI `lms`
- **Headless** — `llmster` daemon: `lms daemon up`, `lms get <model>`, `lms server start`, `lms chat`

Default server: `http://localhost:1234`. Auth (optional): `Authorization: Bearer $LM_API_TOKEN`.

---

## Model lifecycle (load / unload)

### List models — `GET /api/v1/models`

- No body. Returns `{ models: [...] }`.
- Each model: `type` ("llm" | "embedding"), `key`, `display_name`, `loaded_instances` (array of `{ id, config }`), `max_context_length`, `capabilities` (e.g. `vision`, `trained_for_tool_use`).
- **Loaded instances**: `loaded_instances[].id` is the **instance_id** used for unload.

### Load model — `POST /api/v1/models/load`

**Body:**

- `model` (required) — unique identifier (e.g. `openai/gpt-oss-20b`).
- Optional: `context_length`, `eval_batch_size`, `flash_attention`, `num_experts` (MoE), `offload_kv_cache_to_gpu`, `echo_load_config`. This project sends all of these when provided in load config.

**Response:** `type`, `instance_id`, `load_time_seconds`, `status: "loaded"`, optional `load_config`.

### Unload model — `POST /api/v1/models/unload`

**Body:** `instance_id` (required) — the instance to unload (from list’s `loaded_instances[].id` or load response’s `instance_id`).

**Response:** `{ instance_id }`.

- To unload *all* loaded models: call `GET /api/v1/models`, collect every `loaded_instances[].id`, then `POST /api/v1/models/unload` for each.

---

## JIT loading, TTL, and Auto-Evict

- **JIT (Just-In-Time) loading** — If a chat request targets a model that isn’t loaded, LM Studio can load it on first use (default: enabled).
- **Idle TTL** — How long a model can sit idle before being auto-unloaded. Default 60 minutes. Can set per request (e.g. `ttl: 300` for 5 min) on chat/completions; or `lms load <model> --ttl 3600`.
- **Auto-Evict** (Developer tab > Server Settings, default: **on**):
  - **ON**: When a *new* model is loaded **via JIT**, previously JIT-loaded models are unloaded first. At most one JIT-loaded model in memory.
  - **OFF**: Multiple models can stay loaded until TTL or manual unload.
  - **Non–JIT-loaded models are not affected** by Auto-Evict. If you explicitly call `POST /api/v1/models/load`, that model is not “JIT” and won’t trigger eviction of others; you can end up with multiple loaded models (and OOM/crashes) unless you unload first.

**Takeaway for apps:** If you explicitly **load** a model (e.g. on mode switch), always **unload all** first (e.g. list models → unload every `loaded_instances[].id`), then load the one you want. Don’t rely on Auto-Evict for explicitly loaded models.

---

## Chat — `POST /api/v1/chat`

**Body:**

- `model` (required), `input` (string or array of `{ type: "message"|"image", content` or `data_url` }).
- Optional: `system_prompt`, `stream`, `temperature`, `top_p`, `top_k`, `min_p`, `repeat_penalty`, `max_output_tokens`, `reasoning`, `context_length`, `store`, `previous_response_id`.
- `integrations`: plugins / ephemeral MCP (e.g. `{ type: "ephemeral_mcp", server_label, server_url, allowed_tools }` or `{ type: "plugin", id: "mcp/playwright", allowed_tools }`).

**Response:** `model_instance_id`, `output` (array of `message` / `tool_call` / `reasoning` / `invalid_tool_call`), `stats` (tokens, tokens_per_second, time_to_first_token_seconds, optional `model_load_time_seconds`), optional `response_id`.

- **Stateful:** Default `store: true` returns `response_id`; send `previous_response_id` in the next request to continue the thread.
- **Streaming:** `stream: true` → SSE events (see below).

---

## Streaming events (`stream: true`)

SSE format: `event: <type>\ndata: <JSON>\n\n`. Order: starts with `chat.start`, ends with `chat.end`.

**Events:**  
`chat.start` → optional `model_load.start` / `model_load.progress` / `model_load.end` → `prompt_processing.start` / `prompt_processing.progress` / `prompt_processing.end` → optional `reasoning.start` / `reasoning.delta` / `reasoning.end` → optional `tool_call.start` / `tool_call.arguments` / `tool_call.success` or `tool_call.failure` → `message.start` / `message.delta` / `message.end` → `chat.end` (with full `result`). On error: `error` (plus final `chat.end` with partial result).

`chat.end`’s `result` matches the non-streaming response shape (`model_instance_id`, `output`, `stats`, `response_id`).

---

## OpenAI-compatible endpoints

- **Base URL** for OpenAI clients: `http://localhost:1234/v1`.
- **Endpoints:** `GET /v1/models`, `POST /v1/chat/completions`, `POST /v1/responses`, `POST /v1/embeddings`, `POST /v1/completions`.
- **Models list:** `GET /v1/models` — returns models visible to the server (can include all downloaded when JIT is enabled).
- **Chat:** Standard `messages`, `model`, `temperature`, `max_tokens`, `stream`, etc.; prompt template applied automatically for chat models.

---

## Download

- **Start download:** `POST /api/v1/models/download` — body: `model` (catalog id or Hugging Face URL), optional `quantization`.
- **Status:** `GET /api/v1/models/download/status/:job_id` — returns `job_id`, `status` (downloading | paused | completed | failed), `total_size_bytes`, `downloaded_bytes`, `bytes_per_second`, `estimated_completion`, `started_at`, `completed_at`.

---

## Authentication (0.4.0+)

- Optional. Enable in Developer > Server Settings; then all REST/SDK requests need `Authorization: Bearer <token>`.
- Create/manage tokens in Server Settings > Manage Tokens; permissions configurable.

---

## Endpoint summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/models` | GET | List models (with `loaded_instances`) |
| `/api/v1/models/load` | POST | Load model (body: `model`, optional config) |
| `/api/v1/models/unload` | POST | Unload instance (body: `instance_id`) |
| `/api/v1/models/download` | POST | Start download |
| `/api/v1/models/download/status/:job_id` | GET | Download status |
| `/api/v1/chat` | POST | Chat (stateful, optional MCP, optional stream) |

---

*Source: [lmstudio.ai/docs/developer](https://lmstudio.ai/docs/developer) — REST, Core (auth, TTL, Auto-Evict), OpenAI-compat. Keep this file in sync with official docs when integrating new features.*
