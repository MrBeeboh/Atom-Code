#!/usr/bin/env python3
"""
Standalone Troubleshooter for VibeCoderContextManager
- Imports your existing class without modifications.
- Overrides defaults in memory (lowered thresholds for demo).
- Adds realistic, longer messages to force triggering.
- Prints detailed diagnostics: counts, decisions, summary, efficiency.
- Cleans up test history file after.
- No file edits, no dependencies beyond requests (already in your class).
"""
import time
from pathlib import Path
import requests
from vibe_coder_context_manager import VibeCoderContextManager

def check_lm_studio(url="http://localhost:1234/api/v1/models"):
    """Check LM Studio server and whether any model is loaded (for summarization)."""
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        models = data.get("models", []) if isinstance(data, dict) else []
        if not isinstance(models, list):
            models = []
        has_loaded = any(
            len(m.get("loaded_instances") or []) > 0
            for m in models
            if isinstance(m, dict)
        )
        return True, has_loaded
    except Exception:
        return False, False


if __name__ == "__main__":
    print("=== Starting Troubleshoot (no files modified) ===")

    lm_up, has_loaded = check_lm_studio()
    print(f"LM Studio status: {'UP' if lm_up else 'DOWN (start LM Studio server on port 1234)'}")
    print(f"Model loaded: {'YES' if has_loaded else 'NO (load summarizer model in LM Studio for summaries)'}")
    if not lm_up:
        print("  → Summarization may fallback to raw. Fix: Start LM Studio and load e.g. gemma-3-4b-it-Q4_K_M.gguf.")

    session_id = "troubleshoot-test"
    manager = VibeCoderContextManager(
        keep_raw_turns=3,
        token_threshold=800,
        turn_threshold=5,
        summarizer_url="http://localhost:1234/v1/chat/completions",
        summarizer_model="gemma-3-4b-it-Q4_K_M.gguf",
    )
    print("Manager created with temp overrides (original file unchanged)")
    
    print("Adding 12 turns (24 messages) with realistic length content...")
    for i in range(12):
        user_msg = f"User #{i+1}: Fix bug in vibe_coder.py - here's the code: def bad_func(x): return x / 0  # ZeroDivisionError. Stack trace: Traceback (most recent call last): File 'main.py', line 10, in <module> result = bad_func(5) File 'vibe_coder.py', line 5, in bad_func return x / 0 ZeroDivisionError: division by zero. Also, add feature: integrate RAG with Chroma DB for file search. Constraints: Local only, no cloud, Ryzen 5 5600 + RTX 4070 compatible."
        assist_msg = f"Assistant #{i+1}: Fixed: Use try/except. New code: def safe_func(x): try: return x / 0 except ZeroDivisionError: return float('inf')  # Return infinity. Tested on Linux Mint. For RAG: Install chromadb (pip install chromadb), then vectorize docs: import chromadb; client = chromadb.Client(); collection = client.create_collection('vibe_docs'); collection.add(documents=['your text'], ids=['1']). Runs fast on 4070."
        manager.add_message(session_id, "user", user_msg)
        manager.add_message(session_id, "assistant", assist_msg)
    print(f"Full history now has {len(manager.get_full_history(session_id))} messages")
    
    full_hist = manager.get_full_history(session_id)
    old_msgs = full_hist[:-(manager.keep_raw_turns * 2)]
    old_tokens = manager._estimate_tokens_for_messages(old_msgs)
    total_turns = len(full_hist) // 2
    should_sum = manager.should_summarize(full_hist)
    
    print("\n=== Diagnostics ===")
    print(f"Total turns: {total_turns} (threshold {manager.turn_threshold}) → {'Triggers' if total_turns >= manager.turn_threshold else 'Does NOT'}")
    print(f"Old part tokens est: {old_tokens} (threshold {manager.token_threshold}) → {'Triggers' if old_tokens > manager.token_threshold else 'Does NOT'}")
    print(f"Should summarize? {'YES' if should_sum else 'NO'}")
    
    start = time.time()
    new_user = "Summarize the bug fixes and RAG plans so far."
    prepared = manager.prepare_prompt_for_lm_studio(session_id, new_user, "You are Vibe Coder.")
    duration = time.time() - start
    
    full_tokens = manager._estimate_tokens_for_messages(full_hist)
    prep_tokens = manager._estimate_tokens_for_messages(prepared)
    reduction = 100 - (100 * prep_tokens / full_tokens) if full_tokens > 0 else 0
    
    print(f"\nPrepare took {duration:.2f}s")
    print(f"Full tokens: {full_tokens}")
    print(f"Prepared tokens: {prep_tokens}")
    print(f"Efficiency gain: {reduction:.1f}%")
    
    summary_present = any("SUMMARY OF EARLIER CONVERSATION" in m.get('content', '') for m in prepared)
    print(f"Summary block present: {'YES' if summary_present else 'NO'}")
    
    if summary_present:
        for m in prepared:
            if "SUMMARY" in m.get('content', ''):
                print("\nGenerated Summary excerpt:")
                print(m['content'][:400] + "..." if len(m['content']) > 400 else m['content'])
                break
    
    hist_path = manager._get_history_path(session_id)
    if hist_path.exists():
        hist_path.unlink()
        print("Test history cleaned up")
    
    print("\n=== Verdict ===")
    if reduction > 10 and summary_present:
        print("SUCCESS: Compression triggered and reduced tokens.")
    else:
        print("Still not compressing — LM Studio may not be running or summarizer model not loaded.")
        print("Fix: Start LM Studio, load the summarizer model (e.g. gemma-3-4b-it-Q4_K_M.gguf), then re-run.")
