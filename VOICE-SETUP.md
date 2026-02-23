# Voice-to-text (faster-whisper backend)

The **mic button** in the chat input sends recorded audio to a **local Python server** that uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) for speech-to-text. No browser-based speech recognition; no PyTorch/Transformers.

## 1. Run the voice server

**Option A — Use the main startup script (recommended):**

From the project root:

```bash
./start-atom-code.sh
```

The script starts the voice server on port 8765 and, if you have `voice-server/venv`, runs `pip install -r requirements.txt` there first.

**Option B — Run the voice server by hand:**

```bash
cd voice-server
python3 -m venv venv
source venv/bin/activate   # Linux/macOS; on Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 -m uvicorn app:app --host 0.0.0.0 --port 8765
```

See **voice-server/README.md** for model options (tiny/small/large-v3), limits, and health check.

## 2. Use the mic in ATOM Code

- Start the app: `./start-atom-code.sh` (or `npm run dev` for frontend only).
- Open **Settings** → **Voice server URL** should be `http://localhost:8765` (default).
- In the chat input bar, click the **mic** (🎤). Click again to stop recording; the server transcribes and inserts text into the input.

Voice works in **chat only** (not in the terminal or editor panel).

## 3. If something goes wrong

- **Mic shows an error:** Ensure the voice server is running on port 8765 and the URL in Settings is correct. Check **GET** `http://localhost:8765/health` in a browser or with `curl`.
- **Server OOM / slow:** Use a smaller model: `export WHISPER_MODEL=tiny` before starting the server (see voice-server/README.md).
- **No audio / WebM errors:** Install **ffmpeg** and add it to your PATH; the server uses it to decode browser-recorded WebM.
