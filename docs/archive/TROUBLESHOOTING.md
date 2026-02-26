# ATOM Code — Troubleshooting

## Port Conflicts (EADDRINUSE on startup)

**Symptom:** `start-atom-code.sh` fails with errors like:
```
Error: listen EADDRINUSE: address already in use :::8767
Error: Port 5173 is already in use
```

**Fix — run cleanup.sh:**
```bash
cd ~/atom-code && ./cleanup.sh
sleep 2 && ./start-atom-code.sh
```

**Manual fix if cleanup.sh doesn't work:**
```bash
sudo lsof -ti :5173 | xargs kill -9 2>/dev/null
sudo lsof -ti :8765 | xargs kill -9 2>/dev/null
sudo lsof -ti :8767 | xargs kill -9 2>/dev/null
sudo lsof -ti :8768 | xargs kill -9 2>/dev/null
```

---

## Voice Server Not Starting

**Symptom:** `ERROR: [Errno 98] address already in use` on port 8765

**Fix:**
```bash
sudo lsof -ti :8765 | xargs kill -9 2>/dev/null
```

**Other voice issues:**
- Ensure `ffmpeg` is installed: `sudo apt install ffmpeg`
- Check microphone permissions in Chrome (Settings → Privacy → Microphone)
- Verify voice server logs for Whisper model path errors

---

## App Loads But Voice Commands Not Working

1. Open Chrome DevTools Console (F12)
2. Click mic, say "run it"
3. Look for: `[voice] transcribed: "Run it."`
4. If you see transcribed but no `[voice-cmd] matched:` — check that you're on a **coding preset** (Code, Debug, Review, Refactor, Explain). Voice commands are disabled in General preset by design.

---

## LM Studio Connection Failed (spinner, no response)

1. Open LM Studio — ensure server is **running** (green indicator)
2. Ensure a model is **loaded** (not just downloaded)
3. Check CORS in LM Studio settings — must allow `localhost`
4. Verify LM Studio is on port 1234

---

## Context / 400 Bad Request Error

**Symptom:** Request fails with 400, especially with Code preset and large models

**Fix:** Already resolved — ChatView.svelte dynamically detects context window size. If it recurs, check console for `[context] contextMax:` log to verify detection is working.

---

## Nuclear Reset (if everything is broken)

```bash
cd ~/atom-code
git reset --hard stable-phase12a-presetfix
git push origin main --force
./cleanup.sh && sleep 2 && ./start-atom-code.sh
```
