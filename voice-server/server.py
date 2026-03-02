import os
import io
import re
import base64
import logging
import threading
import tempfile
import numpy as np
import soundfile as sf
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename='voice_server.log',
    filemode='a'
)
logger = logging.getLogger("voice-server")

app = FastAPI(title="ATOM Voice Server", version="1.0.0")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global models
_stt_model = None
_tts_model = None
REQUEST_LOCK = threading.Lock()

# STT Configuration
STT_MODEL_SIZE = "base.en"
STT_DEVICE = "cuda" if os.environ.get("USE_CUDA", "true").lower() == "true" else "cpu"

# TTS Configuration
# Ensure these files exist or are downloaded
MODEL_PATH = os.path.join(os.path.dirname(__file__), "kokoro-v0_19.onnx")
VOICES_PATH = os.path.join(os.path.dirname(__file__), "voices.bin")

def get_stt_model():
    global _stt_model
    if _stt_model is None:
        logger.info(f"Loading faster-whisper model: {STT_MODEL_SIZE} on {STT_DEVICE}")
        try:
            _stt_model = WhisperModel(STT_MODEL_SIZE, device=STT_DEVICE, compute_type="int8")
        except Exception as e:
            logger.warning(f"Failed to load on {STT_DEVICE}, falling back to cpu: {e}")
            _stt_model = WhisperModel(STT_MODEL_SIZE, device="cpu", compute_type="int8")
    return _stt_model

def get_tts_model():
    global _tts_model
    if _tts_model is None:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(VOICES_PATH):
            logger.error(f"TTS Model files missing: {MODEL_PATH} or {VOICES_PATH}")
            # In a real scenario, we might download them here or error out
            # For now, we'll try to initialize and catch the error
        logger.info(f"Loading kokoro-onnx model from {MODEL_PATH}")
        _tts_model = Kokoro(MODEL_PATH, VOICES_PATH)
    return _tts_model

def clean_text(text):
    """Strips markdown and replaces code blocks with 'code block'."""
    # Replace code blocks with "code block"
    text = re.sub(r'```[\s\S]*?```', ' code block ', text)
    text = re.sub(r'`[^`]*`', ' code block ', text)
    
    # Strip markdown headers, bold, italics
    text = re.sub(r'#+\s+', '', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text) # Links
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/tts/voices")
def list_voices():
    try:
        tts = get_tts_model()
        return {"voices": tts.get_voices()}
    except Exception as e:
        return {"voices": ["af_heart", "am_michael"], "error": str(e)}

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    raw = await audio.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", mode='wb', delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        model = get_stt_model()
        with REQUEST_LOCK:
            segments, _ = model.transcribe(tmp_path, beam_size=5)
            text = "".join(segment.text for segment in segments).strip()
        return {"text": text}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/tts")
async def text_to_speech(request: Request):
    try:
        data = await request.json()
        text = data.get("text", "")
        voice = data.get("voice", "af_heart")
        speed = float(data.get("speed", 1.0))

        if not text:
            return JSONResponse({"error": "No text provided"}, status_code=400)

        cleaned_text = clean_text(text)
        logger.info(f"TTS Request: voice={voice}, speed={speed}, text='{cleaned_text[:50]}...'")

        tts = get_tts_model()
        with REQUEST_LOCK:
            # Special case: af_heart is often stored as just 'af' in some models
            if voice == "af_heart" and "af_heart" not in tts.voices and "af" in tts.voices:
                logger.info("Mapping af_heart to af")
                voice = "af"
            
            samples, sample_rate = tts.create(cleaned_text, voice=voice, speed=speed, lang="en-us")
            
        # Convert to WAV in memory
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV')
        audio_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return {"audio": audio_base64}
    except Exception as e:
        logger.error(f"TTS error: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
