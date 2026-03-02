import { ttsEnabled, ttsPlaying, ttsVoice, ttsSpeed } from './stores.js';
import { get } from 'svelte/store';

const VOICE_SERVER = 'http://127.0.0.1:8765';

let currentAudio = null;

export function stopTTS() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
    }
    ttsPlaying.set(false);
}

export async function speakText(text) {
    if (!get(ttsEnabled)) return;
    if (!text || !text.trim()) return;

    // Stop any currently playing audio first
    stopTTS();

    const voice = get(ttsVoice);
    const speed = get(ttsSpeed);

    try {
        ttsPlaying.set(true);

        // Split into sentences for streaming playback
        // We use a regex that handles abbreviations reasonably well
        const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];

        let playbackQueue = Promise.resolve();

        // Check if we should stop (e.g. if ttsPlaying was toggled off)
        const isAborted = () => !get(ttsPlaying);

        for (const sentence of sentences) {
            if (isAborted()) break;
            const cleanSentence = sentence.trim();
            if (!cleanSentence) continue;

            const fetchPromise = fetch(`${VOICE_SERVER}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanSentence, voice, speed })
            }).then(res => {
                if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
                return res.json();
            });

            playbackQueue = playbackQueue.then(async () => {
                if (isAborted()) return;
                try {
                    const data = await fetchPromise;
                    if (isAborted() || !data.audio) return;

                    const audioBytes = atob(data.audio);
                    const audioArray = new Uint8Array(audioBytes.length);
                    for (let i = 0; i < audioBytes.length; i++) {
                        audioArray[i] = audioBytes.charCodeAt(i);
                    }
                    const blob = new Blob([audioArray], { type: 'audio/wav' });

                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    currentAudio = audio;

                    await new Promise((resolve, reject) => {
                        audio.onended = () => {
                            URL.revokeObjectURL(url);
                            resolve();
                        };
                        audio.onerror = (e) => {
                            URL.revokeObjectURL(url);
                            reject(e);
                        };
                        if (isAborted()) {
                            URL.revokeObjectURL(url);
                            return resolve();
                        }
                        audio.play().catch(reject);
                    });
                } catch (err) {
                    console.error('Sentence playback error:', err);
                }
            });
        }

        await playbackQueue;
        ttsPlaying.set(false);
    } catch (err) {
        console.error('TTS error:', err);
        ttsPlaying.set(false);
    }
}
