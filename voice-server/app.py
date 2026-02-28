import os
import tempfile
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# Limits to avoid crashing the system
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_DURATION_SECONDS = 120  # 2 minutes max audio
REQUEST_LOCK = asyncio.Lock()
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

_whisper_model = None
_tts_pipeline = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload models on startup."""
    global _whisper_model, _tts_pipeline
    logger.info("Initializing models on startup...")
    try:
        from faster_whisper import WhisperModel
        from kokoro import KPipeline
        
        _whisper_model = WhisperModel(
            WHISPER_MODEL,
            device="auto",
            compute_type=COMPUTE_TYPE,
        )
        logger.info(f"Whisper model '{WHISPER_MODEL}' loaded.")
        
        _tts_pipeline = KPipeline(lang_code='a')
        logger.info("Kokoro TTS pipeline loaded.")
    except Exception as e:
        logger.error(f"Failed to load models during startup: {e}", exc_info=True)
    yield

app = FastAPI(title="ATOM Voice", version="2.0.0", lifespan=lifespan)
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

@app.get("/health")
def health():
    return {
        "status": "ok", 
        "engine": "faster-whisper", 
        "model": WHISPER_MODEL,
        "whisper_loaded": _whisper_model is not None,
        "tts_loaded": _tts_pipeline is not None
    }

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(..., description="Audio file (webm, wav, etc.)")):
    if not audio.content_type.startswith("audio/"):
        raise HTTPException(400, f"Invalid file type: {audio.content_type}")

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
            raise HTTPException(400, f"Could not load audio: {str(e)}")
            
        duration = len(y) / sr
        if duration > MAX_DURATION_SECONDS:
            raise HTTPException(413, f"Audio too long (max {MAX_DURATION_SECONDS}s)")

        import soundfile as sf
        wav_path = tmp_path + ".wav"
        sf.write(wav_path, y, 16000)
        
        try:
            async with REQUEST_LOCK:
                if _whisper_model is None:
                    raise HTTPException(503, "Whisper model not loaded")
                segments, _ = _whisper_model.transcribe(wav_path)
                text = "".join(s.text or "" for s in segments).strip()
                return {"text": text}
        finally:
            try:
                os.unlink(wav_path)
            except OSError:
                pass
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription Error: {e}", exc_info=True)
        raise HTTPException(500, f"Transcription failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

import soundfile as sf
import numpy as np
import io
import re

@app.post("/tts")
async def text_to_speech(request: Request):
    try:
        try:
            body = await request.json()
        except:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)
            
        text = body.get("text", "").strip()
        voice = body.get("voice", "af_heart")
        try:
            speed = float(body.get("speed", 1.0))
            if speed <= 0: speed = 1.0
        except:
            speed = 1.0
        
        if not text:
            return JSONResponse({"error": "no text provided"}, status_code=400)
        
        # Aggressive cleaning
        text = re.sub(r'[*_#`\[\]()]', '', text)
        text = re.sub(r'[^\x00-\x7F]+', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        if not text:
            return JSONResponse({"error": "no speakable text"}, status_code=400)
        
        sentences = re.split(r'([.?!]+\s+)', text)
        chunks = []
        current_chunk = ""
        for i in range(0, len(sentences)-1, 2):
            p = sentences[i] + sentences[i+1]
            if len(current_chunk) + len(p) < 400:
                current_chunk += p
            else:
                if current_chunk: chunks.append(current_chunk.strip())
                current_chunk = p
        if sentences: 
            p = sentences[-1] if len(sentences) % 2 != 0 else ""
            if len(current_chunk) + len(p) < 400:
                current_chunk += p
            else:
                if current_chunk: chunks.append(current_chunk.strip())
                current_chunk = p
        if current_chunk: chunks.append(current_chunk.strip())
            
        async with REQUEST_LOCK:
            if _tts_pipeline is None:
                return JSONResponse({"error": "TTS pipeline not loaded"}, status_code=503)
                
            audio_chunks = []
            for chunk in chunks:
                if not chunk.strip(): continue
                generator = _tts_pipeline(chunk, voice=voice, speed=speed, split_pattern=None)
                for _, _, audio in generator:
                    audio_chunks.append(audio)
            
            if not audio_chunks:
                return JSONResponse({"error": "no audio generated"}, status_code=500)
            
            combined = np.concatenate(audio_chunks)
            buffer = io.BytesIO()
            sf.write(buffer, combined, 24000, format='WAV')
            buffer.seek(0)
            return StreamingResponse(buffer, media_type="audio/wav")
        
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
