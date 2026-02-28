import { ttsEnabled, ttsPlaying, ttsVoice, ttsSpeed } from './stores.js';
import { get } from 'svelte/store';

const VOICE_SERVER = 'http://localhost:8765';

let currentAudio = null;
let audioQueue = [];
let isPlayingQueue = false;
let processedIndex = 0;

export function stopTTS() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
    }
    audioQueue = [];
    isPlayingQueue = false;
    processedIndex = 0;
    ttsPlaying.set(false);
}

function filterText(text) {
    if (!text) return "";

    // Remove <thought>...</thought> tags and their content
    // Handle unclosed tags by matching until the end ($)
    let filtered = text.replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, "");

    // Remove "Thinking: ..." blocks
    // Also handle incomplete blocks by matching until the end ($)
    filtered = filtered.replace(/(^|\n)Thinking:[\s\S]*?(\n\n|$)/gi, "$1");

    return filtered.trim();
}

async function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlayingQueue = false;
        ttsPlaying.set(false);
        return;
    }

    isPlayingQueue = true;
    ttsPlaying.set(true);
    const { url } = audioQueue.shift();

    currentAudio = new Audio(url);
    currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        playNextInQueue();
    };
    currentAudio.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        playNextInQueue();
    };

    try {
        await currentAudio.play();
    } catch (err) {
        console.error('TTS playback error:', err);
        playNextInQueue();
    }
}

export async function speakText(text) {
    if (!get(ttsEnabled)) return;
    const filtered = filterText(text);
    if (!filtered) return;

    stopTTS();
    await speakChunk(filtered);
}

async function speakChunk(text) {
    const voice = get(ttsVoice);
    const speed = get(ttsSpeed);

    try {
        const response = await fetch(`${VOICE_SERVER}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice, speed })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error('TTS chunk error:', err.error);
            return;
        }

        // Response is now direct binary WAV data
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        audioQueue.push({ url });
        if (!isPlayingQueue) {
            playNextInQueue();
        }
    } catch (err) {
        console.error('TTS chunk fetch error:', err);
    }
}

/**
 * Handles streaming text updates.
 * splits text into sentences and speaks newly completed ones.
 */
export async function speakTextStream(fullText, isFinal = false) {
    if (!get(ttsEnabled)) return;

    const filtered = filterText(fullText);
    if (!filtered) {
        if (isFinal) stopTTS();
        return;
    }

    // Only process new text
    const newText = filtered.slice(processedIndex);
    if (!newText) return;

    // Split by sentence-ending punctuation
    const sentenceEndRegex = /[.!?](\s+|\n|$)/g;
    let match;
    let pendingSentences = [];
    let lastMatchEnd = 0;

    // Synchronously find all complete sentences in the NEW piece of text
    while ((match = sentenceEndRegex.exec(newText)) !== null) {
        const sentence = newText.slice(lastMatchEnd, match.index + 1).trim();
        if (sentence) {
            pendingSentences.push(sentence);
        }
        lastMatchEnd = match.index + match[0].length;
    }

    // Update processedIndex IMMEDIATELY to prevent race conditions from subsequent calls
    processedIndex += lastMatchEnd;

    // Now queue each sentence
    for (const sentence of pendingSentences) {
        await speakChunk(sentence);
    }

    if (isFinal) {
        // Grab any leftover text that didn't end with punctuation
        const remaining = filtered.slice(processedIndex).trim();
        if (remaining) {
            await speakChunk(remaining);
        }
        processedIndex = filtered.length;
    }
}
