# pip install requests
# LM Studio summarizer: gemma-3-4b-it-Q4_K_M.gguf loaded
# Trigger: turns >=7 OR old tokens >1500
# Fallback: raw recent turns + placeholder
"""
Vibe Coder Dynamic Summarization Context Manager.

PROJECT CONTEXT:
Vibe Coder is a front-end on Linux Mint that talks to LM Studio (backend) for "vibe coding" sessions.
The old way sent the entire raw history every time → wasteful. This module implements the dynamic
summarization approach: keep the last 5 raw turns untouched, summarize everything older when
turns >= 7 OR old tokens > 1500. Summarization runs via LM Studio (same server, summarizer model).
Full history stays on disk for UI; LM Studio receives a compressed prompt.
"""

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


class VibeCoderContextManager:
    """
    Dynamic summarization context manager for Vibe Coder.
    Keeps last keep_raw_turns (default 5) raw message pairs untouched; summarizes older history
    when turn_threshold (7) OR token_threshold (1500) is exceeded. Summarization via LM Studio.
    Full history is always saved to disk for UI display.
    """

    def __init__(
        self,
        keep_raw_turns: int = 5,
        token_threshold: int = 1500,
        turn_threshold: int = 7,
        summarizer_url: str = "http://localhost:1234/v1/chat/completions",
        summarizer_model: str = "gemma-3-4b-it-Q4_K_M.gguf",
        history_dir: str = "~/.vibe-coder/history",
    ) -> None:
        self.keep_raw_turns = keep_raw_turns
        self.token_threshold = token_threshold
        self.turn_threshold = turn_threshold
        self.summarizer_url = summarizer_url
        self.summarizer_model = summarizer_model
        self.history_dir = Path(history_dir).expanduser().resolve()
        self.history_dir.mkdir(parents=True, exist_ok=True)

    def _get_history_path(self, session_id: str) -> Path:
        """Return the file path for this session's history JSON. Session ID can be e.g. 'project-main' or a UUID."""
        safe_id = re.sub(r"[^\w\-]", "_", session_id)
        return self.history_dir / f"{safe_id}.json"

    def load_full_history(self, session_id: str) -> List[Dict[str, str]]:
        """
        Load the full raw history from disk for this session.
        Returns list of {"role": "user"|"assistant", "content": str, "timestamp": iso string}.
        """
        path = self._get_history_path(session_id)
        if not path.exists():
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError) as e:
            print(f"[VibeCoderContextManager] load_full_history error: {e}")
            return []

    def save_full_history(self, session_id: str, history: List[Dict[str, str]]) -> None:
        """Save the full raw history to disk. Full history is ALWAYS saved for UI/display."""
        path = self._get_history_path(session_id)
        self.history_dir.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)

    def _estimate_tokens(self, text: str) -> int:
        """Standard rough estimate; works great for code + text."""
        return max(1, len(text) // 4)

    def _estimate_tokens_for_messages(self, messages: List[Dict]) -> int:
        """Sum estimated tokens for all message contents in the list."""
        total = 0
        for m in messages:
            content = m.get("content") if isinstance(m.get("content"), str) else str(m.get("content", ""))
            total += self._estimate_tokens(content)
        return total

    def should_summarize(
        self,
        history: List[Dict],
        keep_raw_turns: Optional[int] = None,
    ) -> bool:
        """
        Trigger summarization when turns >= turn_threshold OR old_tokens > token_threshold (OR logic).
        """
        k = keep_raw_turns if keep_raw_turns is not None else self.keep_raw_turns
        total_turns = len(history) // 2
        num_keep = k * 2
        if len(history) <= num_keep:
            return False
        old_msgs = history[: -(k * 2)]
        old_tokens = (
            self._estimate_tokens_for_messages(old_msgs)
            if hasattr(self, "_estimate_tokens_for_messages")
            else sum(len(m.get("content", "")) // 4 for m in old_msgs)
        )
        return total_turns >= self.turn_threshold or old_tokens > self.token_threshold

    def generate_summary(self, old_messages: List[Dict]) -> str:
        """
        Call LM Studio (summarizer model) to summarize old_messages.
        On exception: print and return fallback string.
        """
        if not old_messages:
            return "No prior conversation history."
        history_text = "\n".join([f'{m["role"]}: {m["content"]}' for m in old_messages])
        prompt = f"""You are an elite Context Compressor for Vibe Coder.
Create dense summary of history. Preserve project goal, files, code, bugs/fixes, status, preferences, pending tasks.
Format markdown sections.
Be concise.
History:
{history_text}"""
        try:
            resp = requests.post(
                self.summarizer_url,
                json={
                    "model": self.summarizer_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 1000,
                    "stream": False,
                },
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            summary = (data["choices"][0]["message"]["content"] or "").strip()
            return summary or "Empty summary."
        except Exception as e:
            print(f"Summary failed: {e}")
            return "Summary unavailable – continuing with raw history."

    def prepare_prompt_for_lm_studio(
        self,
        session_id: str,
        new_user_message: str,
        main_system_prompt: str = "You are a helpful, high-vibe coding assistant.",
        rag_context: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """
        Build the prompt to send to LM Studio: [main system] + [RAG if any] + [summary if any]
        + [last N raw messages] + [new user message].
        """
        history = self.load_full_history(session_id)
        keep_raw_turns = self.keep_raw_turns
        num_keep_messages = 2 * keep_raw_turns
        out: List[Dict[str, str]] = []

        main_system = (main_system_prompt or "").strip() or "You are a helpful, high-vibe coding assistant."
        out.append({"role": "system", "content": main_system})

        if rag_context and (rag_context := rag_context.strip()):
            out.append({"role": "system", "content": f"--- RELEVANT CONTEXT (from past sessions) ---\n{rag_context}\n--- END RELEVANT CONTEXT ---"})

        if self.should_summarize(history, keep_raw_turns):
            old_messages = history[:-num_keep_messages] if len(history) > num_keep_messages else []
            summary = self.generate_summary(old_messages)
            out.append({"role": "system", "content": f"--- SUMMARY OF EARLIER CONVERSATION ---\n{summary}\n--- END SUMMARY ---"})
            recent = history[-num_keep_messages:] if len(history) >= num_keep_messages else history
        else:
            recent = history

        for m in recent:
            role = m.get("role")
            content = m.get("content", "")
            if role in ("user", "assistant") and isinstance(content, str):
                out.append({"role": role, "content": content})

        out.append({"role": "user", "content": new_user_message if new_user_message is not None else ""})
        return out

    def add_message(self, session_id: str, role: str, content: str) -> None:
        """Append one message to full history and save to disk."""
        history = self.load_full_history(session_id)
        history.append({
            "role": role,
            "content": content,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        })
        self.save_full_history(session_id, history)

    def get_full_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Return full raw history for UI display only."""
        return self.load_full_history(session_id)


if __name__ == "__main__":
    # Quick test
    ctx = VibeCoderContextManager()
    session = "test"
    for i in range(10):
        ctx.add_message(session, "user", f"User message {i}")
        ctx.add_message(session, "assistant", f"Reply {i}")
    prepared = ctx.prepare_prompt_for_lm_studio(session, "Next?", "You are Vibe Coder.")
    print("Summary present:", any("SUMMARY OF EARLIER CONVERSATION" in m["content"] for m in prepared))
    full_tokens = sum(len(m.get("content", "")) // 4 for m in ctx.get_full_history(session))
    prep_tokens = sum(len(m.get("content", "")) // 4 for m in prepared)
    print("Tokens saved (rough):", full_tokens - prep_tokens)


# ---------------------------------------------------------------------------
# NEXT STEPS – Using the context manager in a simple chat loop
# ---------------------------------------------------------------------------
# 1. Create manager:  ctx = VibeCoderContextManager()
# 2. For each user turn:
#      ctx.add_message(session_id, "user", user_input)
# 3. Before calling LM Studio:  messages = ctx.prepare_prompt_for_lm_studio(session_id, user_input, system_prompt)
# 4. POST messages to LM Studio (e.g. http://localhost:1234/v1/chat/completions) with your chat model.
# 5. On reply:  ctx.add_message(session_id, "assistant", assistant_reply)
# 6. For UI: use ctx.get_full_history(session_id) to show full conversation.
# Summarization runs automatically when turns >= 7 or old tokens > 1500; no code changes needed in the loop.
