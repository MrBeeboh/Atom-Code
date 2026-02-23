# Vibe Coder Dynamic Summarization + Optional RAG

- **Summarization:** Keep last 5 raw turns, summarize older history when **turns ≥ 7 OR old tokens > 1500**. Full history on disk for UI; LM Studio gets a compressed prompt. Summarizer runs on **LM Studio** (same server) using the configured summarizer model (e.g. `gemma-3-4b-it-Q4_K_M.gguf`).
- **Optional RAG (Chroma):** Index past code chunks and fixes in a local vector DB. Retrieve only what's relevant to the current query. Use alongside summarization; does not replace it.

## Quick test

```bash
cd context_manager
pip install -r requirements.txt   # requests + chromadb (chromadb optional if you skip RAG)
python3 vibe_coder_context_manager.py   # or: python3 usage_example.py
```

## NEXT STEPS FOR USER

### Integrate into your frontend

- **Option A – Import (same process):** From your Node/Electron or Svelte app, spawn a small Python helper that imports `VibeCoderContextManager`. Your frontend sends `session_id` + `new_user_message` + `main_system_prompt`; the helper returns the prepared messages list. Your app then POSTs that list to LM Studio (`http://localhost:1234/v1/chat/completions`).
- **Option B – Subprocess:** Run a thin wrapper script with JSON on stdin: `{ "session_id", "new_user_message", "main_system_prompt" }`. Script prints the prepared messages JSON to stdout. Frontend parses and sends to LM Studio.
- **Option C – REST wrapper:** Add a tiny Flask/FastAPI server that exposes e.g. `POST /prepare_prompt` and `POST /add_message`, `GET /history/{session_id}`. Frontend calls this service, then sends the returned messages to LM Studio.

### Simple chat loop

1. Create manager: `ctx = VibeCoderContextManager()`
2. For each user turn: `ctx.add_message(session_id, "user", user_input)`
3. Before calling LM Studio: `messages = ctx.prepare_prompt_for_lm_studio(session_id, user_input, system_prompt)`
4. POST `messages` to LM Studio (`http://localhost:1234/v1/chat/completions`) with your chat model.
5. On reply: `ctx.add_message(session_id, "assistant", assistant_reply)`
6. For UI: use `ctx.get_full_history(session_id)` to show full conversation.

Summarization runs automatically when thresholds are exceeded; no extra code in the loop.

### Summarizer (LM Studio)

- **Endpoint:** `http://localhost:1234/v1/chat/completions`
- **Model:** Load `gemma-3-4b-it-Q4_K_M.gguf` (or your chosen summarizer) in LM Studio. If the summarizer call fails (e.g. model not loaded), the manager falls back to "Summary unavailable – continuing with raw history." and still sends the last N raw turns.

### Change model or thresholds

In code or when instantiating:

```python
manager = VibeCoderContextManager(
    summarizer_url="http://localhost:1234/v1/chat/completions",
    summarizer_model="gemma-3-4b-it-Q4_K_M.gguf",
    keep_raw_turns=5,       # keep last 5 user+assistant pairs (10 messages)
    token_threshold=1500,   # summarize when old part exceeds this (OR)
    turn_threshold=7,       # or when total turns >= 7
)
```

### Optional: Chroma RAG

```python
from vibe_coder_context_manager import VibeCoderContextManager
from vibe_coder_rag import VibeCoderRAG

manager = VibeCoderContextManager(...)
rag = VibeCoderRAG(chroma_dir="~/.vibe-coder/chroma")

# After each assistant reply (or when you have a fix to remember):
rag.index_message(session_id, "assistant", assistant_content)

# When preparing the next prompt:
rag_context = rag.retrieve(new_user_message, session_id=session_id, top_k=5)
prepared = manager.prepare_prompt_for_lm_studio(
    session_id, new_user_message, main_system_prompt, rag_context=rag_context
)
```

Chroma runs locally (CPU default embedding, small footprint). First run may download the embedding model (~80MB).

### Reminder

Summarization uses LM Studio (same server as chat). Load the summarizer model in LM Studio when you want summaries; otherwise the manager uses the fallback and recent raw turns only.
