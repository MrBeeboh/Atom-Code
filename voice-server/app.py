"""
Voice-to-text server for ATOM UI.
Uses faster-whisper with int8 quantization (~1.5GB VRAM).
Run: uvicorn app:app --host 0.0.0.0 --port 8765
"""
import os
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Limits to avoid crashing the system
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_DURATION_SECONDS = 120  # 2 minutes max audio
REQUEST_LOCK = threading.Lock()
LOCK_TIMEOUT = 300  # 5 min max wait for lock

# Model: large-v3-turbo with int8 for lower VRAM
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="ATOM Voice", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(
            WHISPER_MODEL,
            device="auto",
            compute_type=COMPUTE_TYPE,
        )
    return _model


@app.get("/health")
def health():
    return {"status": "ok", "engine": "faster-whisper", "model": WHISPER_MODEL}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(..., description="Audio file (webm, wav, etc.)")):
    raw = await audio.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_FILE_BYTES // (1024*1024)} MB)")

    suffix = Path(audio.filename or "audio").suffix or ".webm"
    if suffix not in (".wav", ".mp3", ".flac", ".ogg", ".webm", ".m4a"):
        suffix = ".webm"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        import librosa
        try:
            y, sr = librosa.load(tmp_path, sr=16000, mono=True)
        except Exception as e:
            raise HTTPException(
                400,
                f"Could not load audio (install ffmpeg for webm support): {getattr(e, 'message', str(e))}",
            )
        duration = len(y) / sr
        if duration > MAX_DURATION_SECONDS:
            raise HTTPException(413, f"Audio too long (max {MAX_DURATION_SECONDS}s)")

        # Write 16 kHz mono WAV for faster-whisper
        import soundfile as sf
        wav_path = tmp_path + ".wav"
        sf.write(wav_path, y, 16000)
        try:
            acquired = REQUEST_LOCK.acquire(timeout=LOCK_TIMEOUT)
            if not acquired:
                raise HTTPException(503, "Server busy; try again in a moment")
            try:
                model = _get_model()
                segments, _ = model.transcribe(wav_path)
                text = "".join(s.text or "" for s in segments).strip()
                return {"text": text}
            finally:
                REQUEST_LOCK.release()
        finally:
            try:
                os.unlink(wav_path)
            except OSError:
                pass
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {getattr(e, 'message', str(e))}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
