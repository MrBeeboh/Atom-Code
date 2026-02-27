import { ttsEnabled, ttsPlaying, ttsVoice, ttsSpeed } from './stores.js';
import { get } from 'svelte/store';

const VOICE_SERVER = 'http://localhost:8765';

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

        const response = await fetch(`${VOICE_SERVER}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice, speed })
        });

        if (!response.ok) {
            console.error('TTS request failed:', response.status);
            ttsPlaying.set(false);
            return;
        }

        const data = await response.json();

        if (!data.audio) {
            ttsPlaying.set(false);
            return;
        }

        // Convert base64 WAV to blob and play
        const audioBytes = atob(data.audio);
        const audioArray = new Uint8Array(audioBytes.length);
        for (let i = 0; i < audioBytes.length; i++) {
            audioArray[i] = audioBytes.charCodeAt(i);
        }
        const blob = new Blob([audioArray], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        currentAudio = new Audio(url);
        currentAudio.playbackRate = 1.0;

        currentAudio.onended = () => {
            URL.revokeObjectURL(url);
            currentAudio = null;
            ttsPlaying.set(false);
        };

        currentAudio.onerror = () => {
            URL.revokeObjectURL(url);
            currentAudio = null;
            ttsPlaying.set(false);
        };

        await currentAudio.play();

    } catch (err) {
        console.error('TTS error:', err);
        ttsPlaying.set(false);
    }
}
