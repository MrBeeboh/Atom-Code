# LM Studio ↔ ATOM Code alignment

How this project uses LM Studio and how to keep it optimized. **Do not assume** — all behavior is driven by [LM Studio Developer Docs](https://lmstudio.ai/docs/developer) and the [LM_STUDIO_DEVELOPER_REFERENCE.md](./LM_STUDIO_DEVELOPER_REFERENCE.md) in this repo.

## What this app uses

| Concern | This project | LM Studio API |
|--------|---------------|----------------|
| **Base URL** | `localStorage.lmStudioBaseUrl` or dev proxy `/api/lmstudio` → `http://localhost:1234` | Default `http://localhost:1234` |
| **List models** | `GET /api/v1/models` (primary), fallback `GET /v1/models` | v1 returns `{ models: [...] }` with `loaded_instances[].id` |
| **Load model** | `POST /api/v1/models/load` with `model`, `context_length`, `eval_batch_size`, `flash_attention`, `offload_kv_cache_to_gpu`, optional `num_experts` (MoE), `echo_load_config` | Same; see reference |
| **Unload** | `POST /api/v1/models/unload` with `instance_id`. To unload all: list → collect every `loaded_instances[].id` → unload each | Same; no single “unload all” endpoint |
| **Chat (streaming)** | `POST /v1/chat/completions` (OpenAI-compat) with `stream: true`, `stream_options: { include_usage: true }`, `temperature`, `max_tokens`, `top_p`, `top_k`, `repeat_penalty`, optional `ttl` | Compatible; native `POST /api/v1/chat` would give stateful + `context_length` in request |
| **Eject before load** | On preset change: `unloadAllModelsNative()` then `loadModel(targetModelId)` for local models only | Prevents doubling up; Auto-Evict does **not** apply to explicitly loaded models |

## LM Studio app settings (you set these in the app)

These cannot be changed by this project; they are configured in **LM Studio → Developer / Server**:

1. **Server running** — Toggle on; default port 1234 (or match your Settings → LM Studio URL).
2. **CORS** — Must be enabled so the browser can call LM Studio (e.g. from `http://localhost:5173` or your UI origin).
3. **Auto-Evict** (Server Settings) — **ON** (default). Only affects JIT-loaded models; we still eject-then-load for explicit loads.
4. **JIT loading** — Default on; first chat request can load the model if not loaded.
5. **Idle TTL** — Default 60 min; optional per-request `ttl` in chat is supported by this app when set in Settings.
6. **Require Authentication** — If ON, every request must send `Authorization: Bearer <token>`. This app does not send a token by default; either keep auth OFF or add an LM Studio API token in app Settings (future).

## Run the check script

From the project root:

```bash
node scripts/check-lmstudio.mjs
```

Optional env:

- `LM_STUDIO_BASE_URL` — e.g. `http://localhost:1234` (default if unset).
- `LM_API_TOKEN` — If LM Studio has “Require Authentication” enabled, set this so the script can call the API.

The script verifies connectivity, list/load/unload shapes, and prints a checklist of the settings above so you can confirm they are optimized.

## References

- [LM Studio Developer Docs](https://lmstudio.ai/docs/developer)
- [LM_STUDIO_DEVELOPER_REFERENCE.md](./LM_STUDIO_DEVELOPER_REFERENCE.md) — API details and eject-before-load rules.
