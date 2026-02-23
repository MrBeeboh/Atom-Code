# pip install chromadb
"""
Optional RAG layer for Vibe Coder: index past code chunks and fixes in Chroma (local vector DB).
Retrieve only what's relevant to the current query so the model can "recall that regex fix from Tuesday"
without re-sending 10k tokens. Does not replace or change summarization; use alongside it.
"""

import re
import time
import uuid
from pathlib import Path
from typing import List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings


# Chunk long messages so we don't index one huge blob; ~500 chars per chunk with overlap.
CHUNK_SIZE = 500
CHUNK_OVERLAP = 80


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks for indexing. Keeps code blocks and sentences somewhat intact."""
    if not text or len(text) <= chunk_size:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            # Try to break at newline or space
            break_at = text.rfind("\n", start, end + 1)
            if break_at == -1:
                break_at = text.rfind(" ", start, end + 1)
            if break_at != -1 and break_at > start:
                end = break_at + 1
        chunks.append(text[start:end].strip())
        start = end - overlap if (end - overlap) > start else end
    return [c for c in chunks if c]


class VibeCoderRAG:
    """
    Hybrid RAG-style memory: index key code chunks and past fixes in Chroma (local, tiny).
    When you ask something, retrieve only what's relevant and stuff that into the prompt.
    Optional add-on to VibeCoderContextManager; does not change summarization behavior.
    """

    def __init__(
        self,
        chroma_dir: str = "~/.vibe-coder/chroma",
        collection_name: str = "vibe_coder_memory",
    ) -> None:
        self.chroma_dir = Path(chroma_dir).expanduser().resolve()
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.collection_name = collection_name
        # PersistentClient uses local disk; default embedding (all-MiniLM-L6-v2) runs on CPU, no GPU needed
        self._client = chromadb.PersistentClient(
            path=str(self.chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        # Get or create collection; Chroma uses default embedding function if we don't pass one
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def index_message(self, session_id: str, role: str, content: str) -> None:
        """
        Index one message (e.g. assistant reply with a code fix) into Chroma.
        Long content is chunked so retrieval returns relevant pieces, not one giant doc.
        """
        if not content or not content.strip():
            return
        chunks = _chunk_text(content.strip())
        if not chunks:
            return
        ids = [f"{session_id}_{role}_{uuid.uuid4().hex[:12]}_{i}" for i in range(len(chunks))]
        metadatas = [
            {"session_id": session_id, "role": role, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())}
            for _ in chunks
        ]
        try:
            self._collection.add(
                documents=chunks,
                ids=ids,
                metadatas=metadatas,
            )
        except Exception as e:
            print(f"[VibeCoderRAG] index_message error: {e}")

    def retrieve(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5,
    ) -> str:
        """
        Retrieve top_k most relevant chunks for the query. Optionally filter by session_id.
        Returns a single string to inject as "Relevant context" in the prompt.
        """
        if not query or not query.strip():
            return ""
        try:
            where = {"session_id": session_id} if session_id else None
            results = self._collection.query(
                query_texts=[query.strip()],
                n_results=min(top_k, 20),
                where=where,
            )
            docs = results.get("documents")
            if not docs or not docs[0]:
                return ""
            combined = "\n\n---\n\n".join(docs[0])
            return combined.strip()
        except Exception as e:
            print(f"[VibeCoderRAG] retrieve error: {e}")
            return ""
