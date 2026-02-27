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

import logging

# Configure logging to file
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename='voice_server.log',
    filemode='a'
)
logger = logging.getLogger("voice-server")

from starlette.middleware.base import BaseHTTPMiddleware
import time

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start_time = time.time()
        logger.debug(f"REQ: {request.method} {request.url.path}")
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            logger.info(f"RES: {request.method} {request.url.path} - {response.status_code} ({process_time:.3f}s)")
            return response
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(f"RES ERROR: {request.method} {request.url.path} - {str(e)} ({process_time:.3f}s)", exc_info=True)
            raise

app = FastAPI(title="ATOM Voice", version="2.0.0")
app.add_middleware(LoggingMiddleware)
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
from kokoro import KPipeline
import soundfile as sf
import numpy as np
import io
import base64
from fastapi import Request
from fastapi.responses import JSONResponse

# Initialize Kokoro pipeline once at startup — not per request
# Use 'a' for American English voice, 'af_heart' is natural and clear
tts_pipeline = None

def get_tts_pipeline():
    global tts_pipeline
    if tts_pipeline is None:
        tts_pipeline = KPipeline(lang_code='a')
    return tts_pipeline

@app.post("/tts")
async def text_to_speech(request: Request):
    try:
        raw_body = await request.body()
        logger.debug(f"Received TTS request body length: {len(raw_body)}")
        try:
            body = await request.json()
        except Exception as json_err:
            logger.error(f"JSON decode failed: {json_err}")
            return JSONResponse({"error": f"Invalid JSON: {str(json_err)}"}, status_code=400)
            
        text = body.get("text", "").strip()
        voice = body.get("voice", "af_heart")
        try:
            speed = float(body.get("speed", 1.0))
            if speed <= 0:
                speed = 1.0
        except (TypeError, ValueError):
            speed = 1.0
        
        logger.info(f"Processing TTS: voice={voice}, speed={speed}, text_len={len(text)}")
        
        if not text:
            return JSONResponse({"error": "no text provided"}, status_code=400)
        
        # Strip markdown and aggressive cleaning
        import re
        # Remove bold, italics, code, headers, links
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        text = re.sub(r'\*(.+?)\*', r'\1', text)
        text = re.sub(r'`{1,3}[^`]*`{1,3}', '', text)
        text = re.sub(r'#{1,6}\s', '', text)
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        
        # Remove non-ASCII (emojis, special icons/badges)
        # This is the critical fix for "RuntimeError: Storage size calculation overflowed"
        text = re.sub(r'[^\x00-\x7F]+', ' ', text)
        
        # Remove multiple spaces
        text = re.sub(r'\s+', ' ', text).strip()
        
        logger.info(f"Cleaned TTS text: {text[:100]}...")
        
        if not text:
            return JSONResponse({"error": "no speakable text after cleaning"}, status_code=400)
        
        # Robust sentence/chunk splitting
        # Kokoro can fail on very long individual sentences or large tensors.
        # We split into sentences and then group them into ~400 char chunks.
        sentences = re.split(r'([.?!]+\s+)', text)
        chunks = []
        current_chunk = ""
        
        # Re-combine re.split results (it keeps the delimiters)
        parts = []
        for i in range(0, len(sentences)-1, 2):
            parts.append(sentences[i] + sentences[i+1])
        if len(sentences) % 2 != 0:
            parts.append(sentences[-1])
            
        for p in parts:
            if len(current_chunk) + len(p) < 400:
                current_chunk += p
            else:
                if current_chunk: chunks.append(current_chunk.strip())
                current_chunk = p
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        # Use existing REQUEST_LOCK to prevent concurrent GPU/resource heavy operations
        acquired = REQUEST_LOCK.acquire(timeout=LOCK_TIMEOUT)
        if not acquired:
            return JSONResponse({"error": "Server busy; try again in a moment"}, status_code=503)
            
        try:
            pipeline = get_tts_pipeline()
            audio_chunks = []
            
            for i, chunk in enumerate(chunks):
                if not chunk.strip(): continue
                logger.debug(f"Generating audio for chunk {i+1}/{len(chunks)}: {len(chunk)} chars")
                # Use split_pattern=None because we've already chunked it manually
                generator = pipeline(chunk, voice=voice, speed=speed, split_pattern=None)
                for _, _, audio in generator:
                    audio_chunks.append(audio)
            
            if not audio_chunks:
                return JSONResponse({"error": "no audio generated"}, status_code=500)
            
            # Combine chunks and encode as base64 WAV
            combined = np.concatenate(audio_chunks)
            buffer = io.BytesIO()
            sf.write(buffer, combined, 24000, format='WAV')
            buffer.seek(0)
            audio_b64 = base64.b64encode(buffer.read()).decode('utf-8')
            
            logger.info(f"Successfully generated audio: {len(audio_b64)} b64 bytes")
            return JSONResponse({
                "audio": audio_b64,
                "format": "wav",
                "sample_rate": 24000
            })
        finally:
            REQUEST_LOCK.release()
        
    except Exception as e:
        logger.error(f"TTS Exception: {str(e)}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/tts/voices")
async def list_voices():
    return JSONResponse({
        "voices": [
            {"id": "af_heart", "name": "Heart (Female, Natural)", "lang": "en-us"},
            {"id": "af_bella", "name": "Bella (Female, Warm)", "lang": "en-us"},
            {"id": "am_adam", "name": "Adam (Male, Clear)", "lang": "en-us"},
            {"id": "am_michael", "name": "Michael (Male, Deep)", "lang": "en-us"}
        ]
    })
