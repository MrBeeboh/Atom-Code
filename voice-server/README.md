# Voice-to-text server (faster-whisper)

Backend for the ATOM UI mic button. Uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (CTranslate2) with int8 quantization for local speech-to-text. No PyTorch or Hugging Face Transformers.

## Quick start

1. **Create and activate a venv** (recommended; the main startup script expects `venv` in this directory):

   ```bash
   cd voice-server
   python3 -m venv venv
   source venv/bin/activate   # Linux/macOS
   # Windows: venv\Scripts\activate
   ```

2. **Install dependencies** (first run may download the model, ~1.5 GB for large-v3):

   ```bash
   pip install -r requirements.txt
   ```

   For browser-recorded WebM audio you need **ffmpeg** on your system (librosa uses it to load webm). Install via your package manager or [ffmpeg.org](https://ffmpeg.org/download.html).

3. **Run the server**:

   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8765
   ```

   Or from the project root, use `./start-atom-code.sh`; it will run `pip install -r requirements.txt` and then start this server if `voice-server/venv/bin/python3` exists.

4. In ATOM Code, open **Settings** and set **Voice server URL** to `http://localhost:8765` (default). Use the **mic button** in the chat input to record and transcribe.

## Options

- **Model:** Default is `large-v3`. Override with env:
  ```bash
  export WHISPER_MODEL=large-v3    # default
  export WHISPER_MODEL=tiny        # less RAM/VRAM, lower accuracy
  export WHISPER_MODEL=small       # middle ground
  uvicorn app:app --host 0.0.0.0 --port 8765
  ```

- **Compute type:** Default is `int8`. For GPU you can use `float16`:
  ```bash
  export WHISPER_COMPUTE_TYPE=float16
  ```

- **Port:** Change `8765` if something else uses it.

## Health check

- **GET** `http://localhost:8765/health`  
  Returns `{"status":"ok","engine":"faster-whisper","model":"<WHISPER_MODEL>"}`.

## Limits

- Max upload: **10 MB** per request.
- Max audio length: **2 minutes** per request.
- One transcription at a time (queue); concurrent requests get 503 until the current one finishes.

## Disabling voice

1. Stop the voice server (close the terminal running uvicorn, or stop the process started by `start-atom-code.sh`).
2. In ATOM Code: **Settings** → **Voice server URL** → clear the URL or set to empty. The mic will show an error if used.
