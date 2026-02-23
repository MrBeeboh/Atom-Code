"""
Runnable example for Vibe Coder Dynamic Summarization Context Manager.
Shows: instantiate manager, create session, simulate long chat, prepare compressed prompt,
call LM Studio with prepared messages, get_full_history for UI, and token efficiency.
"""

import sys
from pathlib import Path

# Ensure we can import the manager from same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from vibe_coder_context_manager import VibeCoderContextManager


def main() -> None:
    # 1) Instantiate the manager (defaults: LM Studio summarizer, turns >= 7 OR old tokens > 1500)
    manager = VibeCoderContextManager(history_dir="~/.vibe-coder/history")

    session_id = "example-project-main"

    # 2) Simulate a long chat – add 20 messages (10 user + 10 assistant)
    for i in range(10):
        manager.add_message(session_id, "user", f"User message {i+1}: Can you help me fix the async bug in main.py?")
        manager.add_message(
            session_id,
            "assistant",
            f"Assistant reply {i+1}: We debugged the async bug by swapping Promise.all for sequential awaits. Now it runs in under two seconds. Key files: main.py, utils.py.",
        )

    # 3) Token counts: full history vs compressed prompt
    full_history = manager.get_full_history(session_id)
    full_tokens = manager._estimate_tokens_for_messages(full_history)

    new_user_message = "What was the fix we applied for the async bug?"
    prepared = manager.prepare_prompt_for_lm_studio(
        session_id,
        new_user_message,
        main_system_prompt="You are a helpful, high-vibe coding assistant.",
    )
    compressed_tokens = manager._estimate_tokens_for_messages(prepared)

    print("=== Full history (for UI) ===")
    print(f"Messages in full history: {len(full_history)}")
    print(f"Estimated full history tokens: {full_tokens}")
    print()
    print("=== Prepared prompt for LM Studio (compressed) ===")
    print(f"Messages in prepared prompt: {len(prepared)}")
    print(f"Estimated compressed prompt tokens: {compressed_tokens}")
    print()
    print("Efficiency gain: full history tokens vs compressed prompt tokens")
    print(f"  Full: {full_tokens}  →  Compressed: {compressed_tokens}")
    if full_tokens > 0:
        pct = round((1 - compressed_tokens / full_tokens) * 100)
        print(f"  Reduction: ~{pct}%")
    print()
    print("Prepared messages structure (first 3 + last 2):")
    for i, m in enumerate(prepared[:3]):
        content_preview = (m.get("content") or "")[:80].replace("\n", " ")
        print(f"  [{i}] {m.get('role')}: {content_preview}...")
    print("  ...")
    for i, m in enumerate(prepared[-2:], start=len(prepared) - 2):
        content_preview = (m.get("content") or "")[:80].replace("\n", " ")
        print(f"  [{i}] {m.get('role')}: {content_preview}")

    # 4) How a frontend would call LM Studio with the prepared messages
    print()
    print("=== Example: POST to LM Studio (commented, uncomment to run) ===")
    print("""
import requests
url = "http://localhost:1234/v1/chat/completions"
payload = {
    "model": "your-model-id",  # e.g. qwen/qwen2.5-coder-14b
    "messages": prepared,
    "stream": True,
}
resp = requests.post(url, json=payload, timeout=60, stream=True)
for line in resp.iter_lines():
    if line:
        print(line.decode())
""")

    # 5) How the UI would call get_full_history to display everything
    print()
    print("=== UI display: get_full_history(session_id) ===")
    ui_history = manager.get_full_history(session_id)
    print(f"UI gets {len(ui_history)} messages to render in chat window (full scrollback).")

    # 6) Optional RAG: index a couple of messages, retrieve, pass into prepare_prompt
    try:
        from vibe_coder_rag import VibeCoderRAG
        rag = VibeCoderRAG()
        rag.index_message(session_id, "assistant", "We fixed the async bug in main.py by swapping Promise.all for sequential awaits. Key change: use await in a for-loop instead of Promise.all.")
        rag_context = rag.retrieve("What was the async fix?", session_id=session_id, top_k=3)
        prepared_with_rag = manager.prepare_prompt_for_lm_studio(
            session_id, "What was the async fix?", main_system_prompt="You are a helpful assistant.", rag_context=rag_context
        )
        print()
        print("=== With RAG: prepared_prompt includes RELEVANT CONTEXT from Chroma ===")
        for i, m in enumerate(prepared_with_rag[:4]):
            preview = (m.get("content") or "")[:70].replace("\n", " ")
            print(f"  [{i}] {m.get('role')}: {preview}...")
    except ImportError:
        print()
        print("(Install chromadb to try optional RAG: pip install chromadb)")


if __name__ == "__main__":
    main()
