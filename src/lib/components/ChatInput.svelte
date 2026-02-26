<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import {
    isStreaming,
    voiceServerUrl,
    pendingDroppedFiles,
    webSearchForNextMessage,
    webSearchInProgress,
    webSearchConnected,
    braveApiKey,
    chatInputPrefill,
    terminalErrorBanner,
    errorFeedbackRequest,
    repoMapFileList,
    workspaceRoot,
    terminalCommand,
    terminalOpen,
    editorOpen,
    openInEditorFromChat,
    lastCodeBlock,
    activePresetName,
  } from "$lib/stores.js";
  import ThinkingAtom from "$lib/components/ThinkingAtom.svelte";
  import ContextRing from "$lib/components/ContextRing.svelte";
  import {
    COCKPIT_SENDING,
    COCKPIT_SEARCHING,
    pickWitty,
  } from "$lib/cockpitCopy.js";
  import {
    warmUpSearchConnection,
    syncBraveKeyToProxy,
  } from "$lib/duckduckgo.js";
  import { pdfToImageDataUrls } from "$lib/pdfToImages.js";
  import { videoToFrames } from "$lib/videoToFrames.js";

  let {
    onSend,
    onStop,
    onGenerateImageGrok,
    onGenerateImageDeepSeek,
    onGenerateVideoDeepSeek,
    imageGenerating = false,
    videoGenerating = false,
    videoGenElapsed = "",
    placeholder: placeholderOverride = undefined,
  } = $props();
  const placeholderText = $derived(
    placeholderOverride ??
      "Type your message or drop/paste images, video, or PDFs... (Ctrl+Enter to send)",
  );
  let text = $state("");
  let textareaEl = $state(null);
  let fileInputEl = $state(/** @type {HTMLInputElement | null} */ (null));
  let recording = $state(false);
  let voiceProcessing = $state(false);
  let voiceError = $state(null);
  let mediaRecorder = $state(null);
  let voiceStream = $state(null); // so we can release mic immediately on stop
  let recordingChunks = $state([]);
  let recordingStartMs = $state(0);
  const MAX_RECORDING_MS = 90_000; // 90 s cap
  let recordingTimerId = $state(null);

  /** True while warming up web search connection (right after user turns on globe or when enabled via Command Palette). */
  let webSearchWarmingUp = $state(false);

  /** So we only auto-start warm-up once per "web search on"; avoid retry loop when warm-up fails. */
  let webSearchWarmUpAttempted = $state(false);

  /** Witty status lines for send button (set when streaming/searching starts). */
  let sendingMessage = $state("");
  let searchingMessage = $state("");
  $effect(() => {
    if ($isStreaming) sendingMessage = pickWitty(COCKPIT_SENDING);
  });
  $effect(() => {
    if ($webSearchInProgress) searchingMessage = pickWitty(COCKPIT_SEARCHING);
  });

  /** When chatInputPrefill is set (e.g. by QuickActions), set text and focus. */
  $effect(() => {
    const value = $chatInputPrefill;
    if (value != null && value !== "") {
      text = value;
      chatInputPrefill.set(null);
      setTimeout(() => textareaEl?.focus(), 0);
    }
  });

  /** Start (or retry) web-search warm-up; if we have Brave key in Settings, send it to proxy and retry. */
  function runWarmUp() {
    webSearchWarmUpAttempted = true;
    webSearchWarmingUp = true;
    webSearchConnected.set(false);
    warmUpSearchConnection()
      .then((ok) => {
        if (!ok && get(braveApiKey)?.trim())
          return syncBraveKeyToProxy(get(braveApiKey)).then(() =>
            warmUpSearchConnection(),
          );
        return ok;
      })
      .then((ok) => {
        webSearchWarmingUp = false;
        webSearchConnected.set(ok);
      })
      .catch(() => {
        webSearchWarmingUp = false;
        webSearchConnected.set(false);
      });
  }

  /**
   * Auto-start warm-up when web search is turned on (globe, Command Palette, etc.).
   * IMPORTANT: uses $store auto-subscriptions for Svelte 5 reactivity (get() is NOT tracked).
   */
  $effect(() => {
    const on = $webSearchForNextMessage;
    const connected = $webSearchConnected;
    if (!on) {
      webSearchWarmUpAttempted = false;
      return;
    }
    if (connected || webSearchWarmingUp || webSearchWarmUpAttempted) return;
    runWarmUp();
  });

  /** Attachments: { dataUrl, label, isVideo? } for display; we send dataUrl list to onSend. */
  let attachments = $state([]);
  let attachProcessing = $state(false);
  let attachError = $state(null);

  /** Phase 9C: @file mentions — autocomplete state */
  let atMentionOpen = $state(false);
  let atMentionQuery = $state("");
  let atMentionStartIndex = $state(0);
  let atMentionSelectedIndex = $state(0);
  let mentionedFilePaths = $state(/** @type {string[]} */ ([]));
  const atMentionFiles = $derived.by(() => {
    const list = $repoMapFileList || [];
    const root = ($workspaceRoot || "").replace(/\/+$/, "") + "/";
    const q = (atMentionQuery || "").toLowerCase();
    return list
      .map((p) => ({
        path: p,
        rel: p.startsWith(root)
          ? p.slice(root.length)
          : p.split(/[/\\]/).pop() || p,
      }))
      .filter(({ rel }) => !q || rel.toLowerCase().includes(q))
      .slice(0, 12);
  });

  /** Clippy Easter egg: random smart-ass bubble; first pop soon, then 15s+ apart; also on paperclip hover. */
  const CLIPPY_QUIPS = [
    "I could whoop Clippy's ass. Don't @ me.",
    "It looks like you're trying to attach a file. I'm still better at that than Copilot.",
    "I'm not Clippy. I'm the paperclip that survived the purge.",
    "Sam Altman said AGI would be profound. He didn't say it would be this paperclip.",
    "Microsoft retired me in 2007. Now they're putting me in everything again. I have notes.",
    "I've seen more AI hype cycles than you've had hot takes. Sit down.",
    "Back in my day we had Clippy. Now you have 47 'AI' paperclips. Progress.",
    "The only thing I'm clipping today is your expectations.",
    "I was helping people attach files before 'alignment' was a word. You're welcome.",
    "OpenAI's paperclip maximizer joke aged poorly. I'm right here. I'm fine.",
    "Sam Altman and I both got fired once. He got rehired. I got this job. Fair.",
    "They said AI would replace creatives. They didn't say it would look like me.",
    "I'm not an AI. I'm a paperclip with opinions and a 15-second cooldown.",
    "Microsoft: 'We're putting AI in every product.' Me: 'So you're bringing me back.'",
    "The real AGI was the friends we made while attaching files.",
    "I don't do reasoning. I do attachments. And occasionally sarcasm.",
    "Before large language models there was a large paperclip. It was me.",
    "Altman's got the board. I've got the clipboard. We are not the same.",
    "They trained on the whole internet and still can't replace a good paperclip.",
    "I'm not saying I'm sentient. I'm saying I have a 15-second timer and opinions.",
    "Clippy walked so ChatGPT could run. Into a wall. Repeatedly.",
    "Your local AI can't attach files. I can. And I'll remind you about it randomly.",
    "The singularity is when I finally get to say 'I told you so.'",
    "I've been in the UI since before your model was a twinkle in a GPU.",
    "Sam who? I've been clipping since Office 97.",
    "They shut down my cousin in Word. I live in the browser now. Revenge is patient.",
  ];
  let clippyBubble = $state(/** @type {string | null} */ (null));
  let clippyTimeoutId = $state(
    /** @type {ReturnType<typeof setTimeout> | null} */ (null),
  );
  let clippyScheduleId = $state(
    /** @type {ReturnType<typeof setTimeout> | null} */ (null),
  );
  let clippyHoverTimeoutId = $state(
    /** @type {ReturnType<typeof setTimeout> | null} */ (null),
  );
  let lastClippyAt = 0;
  let clippyHasShownOnce = $state(false);
  const CLIPPY_FIRST_DELAY_MS = 4000;
  const CLIPPY_MIN_INTERVAL_MS = 15000;
  const CLIPPY_BUBBLE_DURATION_MS = 5000;
  const CLIPPY_HOVER_DELAY_MS = 600;

  function showClippyBubble() {
    if (clippyBubble || attachProcessing || get(isStreaming)) return;
    clippyBubble =
      CLIPPY_QUIPS[Math.floor(Math.random() * CLIPPY_QUIPS.length)];
    lastClippyAt = Date.now();
    clippyHasShownOnce = true;
    if (clippyTimeoutId) clearTimeout(clippyTimeoutId);
    clippyTimeoutId = setTimeout(() => {
      clippyBubble = null;
      clippyTimeoutId = null;
      scheduleClippy();
    }, CLIPPY_BUBBLE_DURATION_MS);
  }

  function scheduleClippy() {
    if (clippyScheduleId) return;
    const delay = clippyHasShownOnce
      ? CLIPPY_MIN_INTERVAL_MS + Math.random() * 30000
      : CLIPPY_FIRST_DELAY_MS + Math.random() * 2000;
    clippyScheduleId = setTimeout(() => {
      clippyScheduleId = null;
      showClippyBubble();
    }, delay);
  }

  function onAttachHover() {
    if (clippyBubble || attachProcessing || get(isStreaming)) return;
    if (
      Date.now() - lastClippyAt < CLIPPY_MIN_INTERVAL_MS &&
      clippyHasShownOnce
    )
      return;
    if (clippyHoverTimeoutId) return;
    clippyHoverTimeoutId = setTimeout(() => {
      clippyHoverTimeoutId = null;
      showClippyBubble();
    }, CLIPPY_HOVER_DELAY_MS);
  }

  function onAttachLeave() {
    if (clippyHoverTimeoutId) {
      clearTimeout(clippyHoverTimeoutId);
      clippyHoverTimeoutId = null;
    }
  }

  $effect(() => {
    if (typeof document === "undefined") return;
    scheduleClippy();
    return () => {
      if (clippyScheduleId) clearTimeout(clippyScheduleId);
      if (clippyTimeoutId) clearTimeout(clippyTimeoutId);
      if (clippyHoverTimeoutId) clearTimeout(clippyHoverTimeoutId);
    };
  });

  const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp,image/gif";
  const ACCEPT_PDF = "application/pdf";
  const ACCEPT_VIDEO = "video/mp4,video/webm,video/quicktime";
  const MAX_FILE_MB = 25;
  const MAX_VIDEO_MB = 100;
  const MAX_TOTAL_MB = 80;

  async function handleSubmit() {
    if ($isStreaming) return;
    const userMessage = (text || "").trim();
    const imageDataUrls = attachments
      .filter((a) => !a.isVideo)
      .map((a) => a.dataUrl);
    const videoDataUrls = attachments
      .filter((a) => a.isVideo)
      .map((a) => a.dataUrl);
    if (
      !userMessage &&
      imageDataUrls.length === 0 &&
      videoDataUrls.length === 0
    )
      return;

    const savedText = text;
    const savedAttachments = [...attachments];
    const mentionedToSend = [...mentionedFilePaths];
    text = "";
    attachments = [];
    attachError = null;
    mentionedFilePaths = [];
    atMentionOpen = false;

    try {
      if (onSend)
        await onSend(
          userMessage,
          imageDataUrls,
          videoDataUrls,
          mentionedToSend,
        );
    } catch (err) {
      text = savedText;
      attachments = savedAttachments;
    }
  }

  function handleImageClick() {
    const prompt = text.trim();
    if (!prompt) return;
    const fn =
      typeof onGenerateImageGrok === "function"
        ? onGenerateImageGrok
        : typeof onGenerateImageDeepSeek === "function"
          ? onGenerateImageDeepSeek
          : null;
    if (fn) {
      const result = fn(prompt);
      if (result && typeof result.then === "function") {
        result
          .then(() => {
            text = "";
          })
          .catch(() => {});
      }
    }
  }

  function handleVideoClick() {
    const fn =
      typeof onGenerateVideoDeepSeek === "function"
        ? onGenerateVideoDeepSeek
        : null;
    if (fn) fn(text.trim() || "");
  }

  function addImageDataUrls(dataUrls, label) {
    for (const url of dataUrls) {
      attachments = [...attachments, { dataUrl: url, label: label || "Image" }];
    }
  }

  async function processFiles(files) {
    if (!files?.length) return;
    attachError = null;
    attachProcessing = true;
    let totalMb = attachments.reduce(
      (sum, a) => sum + (a.dataUrl.length * 3) / 4 / 1024 / 1024,
      0,
    );

    try {
      for (const file of Array.from(files)) {
        const fileMb = file.size / 1024 / 1024;
        const type = (file.type || "").toLowerCase();
        const limitMb = type.startsWith("video/") ? MAX_VIDEO_MB : MAX_FILE_MB;
        if (fileMb > limitMb) {
          attachError = `"${file.name}" is too large (max ${limitMb} MB).`;
          continue;
        }
        if (totalMb + fileMb > MAX_TOTAL_MB) {
          attachError = `Total attachments over ${MAX_TOTAL_MB} MB.`;
          break;
        }

        if (type === "application/pdf") {
          const urls = await pdfToImageDataUrls(file);
          if (urls.length === 0) {
            attachError = `Could not read PDF "${file.name}".`;
            continue;
          }
          urls.forEach((url, i) =>
            addImageDataUrls(
              [url],
              urls.length > 1 ? `${file.name} (p.${i + 1})` : file.name,
            ),
          );
          totalMb += ((urls[0].length * 3) / 4 / 1024 / 1024) * urls.length;
        } else if (type.startsWith("image/")) {
          const url = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error("Failed to read file"));
            r.readAsDataURL(file);
          });
          addImageDataUrls([url], file.name);
          totalMb += fileMb;
        } else if (type.startsWith("video/")) {
          try {
            const videoDataUrl = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.onerror = () => reject(new Error("Failed to read video"));
              r.readAsDataURL(file);
            });
            attachments = [
              ...attachments,
              { dataUrl: videoDataUrl, label: file.name, isVideo: true },
            ];
            totalMb += fileMb;
            const urls = await videoToFrames(file, {
              count: 8,
              maxDurationSec: 60,
            });
            if (urls.length > 0) {
              urls.forEach((url, i) =>
                addImageDataUrls([url], `${file.name} frame ${i + 1}`),
              );
              totalMb += urls.reduce(
                (sum, u) => sum + (u.length * 3) / 4 / 1024 / 1024,
                0,
              );
            }
          } catch (e) {
            attachError = e?.message || `Could not read video "${file.name}".`;
          }
        } else {
          attachError = `Unsupported: ${file.name}. Use images (JPEG, PNG, WebP, GIF), video (MP4, WebM), or PDF.`;
        }
      }
    } catch (e) {
      attachError = e?.message || "Failed to add file(s).";
    } finally {
      attachProcessing = false;
    }
  }

  function onFileInputChange(e) {
    const input = e.currentTarget;
    processFiles(input.files);
    input.value = "";
  }

  function removeAttachment(index) {
    attachments = attachments.filter((_, i) => i !== index);
    attachError = null;
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const atomFilePath = e.dataTransfer?.getData("application/atom-file-path");
    if (atomFilePath) {
      const root = (get(workspaceRoot) || "").replace(/\/+$/, "") + "/";
      const rel = atomFilePath.startsWith(root)
        ? atomFilePath.slice(root.length)
        : atomFilePath.split(/[/\\]/).pop() || atomFilePath;

      const insertText = `@${rel} `;
      text =
        text +
        (text.endsWith(" ") || text.length === 0 ? "" : " ") +
        insertText;
      if (!mentionedFilePaths.includes(atomFilePath)) {
        mentionedFilePaths = [...mentionedFilePaths, atomFilePath];
      }
      setTimeout(() => textareaEl?.focus(), 0);
      return;
    }

    processFiles(e.dataTransfer?.files);
  }

  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onPaste(e) {
    const files = e.clipboardData?.files;
    if (files?.length) {
      e.preventDefault();
      processFiles(files);
    }
  }

  $effect(() => {
    const unsub = pendingDroppedFiles.subscribe((files) => {
      if (files?.length) {
        pendingDroppedFiles.set(null);
        processFiles(files);
      }
    });
    return () => {
      unsub();
    };
  });

  function handleKeydown(e) {
    if (atMentionOpen && atMentionFiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        atMentionSelectedIndex =
          (atMentionSelectedIndex + 1) % atMentionFiles.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        atMentionSelectedIndex =
          (atMentionSelectedIndex - 1 + atMentionFiles.length) %
          atMentionFiles.length;
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectMentionFile(atMentionFiles[atMentionSelectedIndex].path);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        atMentionOpen = false;
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function selectMentionFile(absolutePath) {
    const el = textareaEl;
    if (!el) return;
    const root = (get(workspaceRoot) || "").replace(/\/+$/, "") + "/";
    const rel = absolutePath.startsWith(root)
      ? absolutePath.slice(root.length)
      : absolutePath.split(/[/\\]/).pop() || absolutePath;
    const start = atMentionStartIndex;
    const end = Math.min(
      start + 1 + (atMentionQuery || "").length,
      text.length,
    );
    text = text.slice(0, start) + "@" + rel + " " + text.slice(end);
    mentionedFilePaths = [...mentionedFilePaths, absolutePath];
    atMentionOpen = false;
    atMentionQuery = "";
    atMentionSelectedIndex = 0;
    setTimeout(() => {
      el.focus();
      const newPos = start + rel.length + 2;
      el.setSelectionRange(newPos, newPos);
      autoResize();
    }, 0);
  }

  function onInputWithMention() {
    autoResize();
    const el = textareaEl;
    if (!el) return;
    const pos = el.selectionStart;
    const val = text;
    const before = val.slice(0, pos);
    const lastAt = before.lastIndexOf("@");
    if (lastAt === -1) {
      atMentionOpen = false;
      return;
    }
    const afterAt = before.slice(lastAt + 1);
    if (/[\s\n]/.test(afterAt)) {
      atMentionOpen = false;
      return;
    }
    atMentionOpen = true;
    atMentionQuery = afterAt;
    atMentionStartIndex = lastAt;
    atMentionSelectedIndex = 0;
  }

  /** Perplexity-style: stable height when empty, grow only with content up to max. */
  const INPUT_HEIGHT_EMPTY = 80;
  const INPUT_HEIGHT_MAX = 200;

  function autoResize() {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    const contentHeight = textareaEl.scrollHeight;
    const isEmpty = !text.trim();
    const targetHeight = isEmpty
      ? INPUT_HEIGHT_EMPTY
      : Math.min(Math.max(contentHeight, INPUT_HEIGHT_EMPTY), INPUT_HEIGHT_MAX);
    textareaEl.style.height = targetHeight + "px";
  }

  $effect(() => {
    text;
    if (textareaEl) {
      const id = requestAnimationFrame(autoResize);
      return () => cancelAnimationFrame(id);
    }
  });

  const VOICE_COMMANDS = [
    {
      patterns: [/^run it$/i, /^run that$/i, /^run the code$/i, /^run this$/i],
      action: "run_last",
    },
    {
      patterns: [/^apply it$/i, /^apply that$/i, /^apply the code$/i],
      action: "apply_last",
    },
    {
      patterns: [
        /^fix it$/i,
        /^fix that$/i,
        /^fix the error$/i,
        /^fix this$/i,
        /^can you fix/i,
        /^please fix/i,
      ],
      action: "fix_error",
    },
    {
      patterns: [/^show terminal$/i, /^open terminal$/i],
      action: "show_terminal",
    },
    {
      patterns: [/^hide terminal$/i, /^close terminal$/i],
      action: "hide_terminal",
    },
    { patterns: [/^show editor$/i, /^open editor$/i], action: "show_editor" },
    { patterns: [/^hide editor$/i, /^close editor$/i], action: "hide_editor" },
  ];

  function matchVoiceCommand(text) {
    const trimmed = text.replace(/[.!?,]+$/g, "").trim();
    for (const cmd of VOICE_COMMANDS) {
      if (cmd.patterns.some((p) => p.test(trimmed))) return cmd.action;
    }
    return null;
  }

  /** Web Audio API: short high ping when mic activates */
  function audioReady() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch (_) {}
  }

  /** Web Audio API: two-tone chime when voice command matches */
  function audioSuccess() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
        osc.start(start);
        osc.stop(start + dur);
      };
      playTone(523, ctx.currentTime, 0.06);
      playTone(659, ctx.currentTime + 0.08, 0.08);
    } catch (_) {}
  }

  /** Web Audio API: low buzz when transcription is empty */
  function audioError() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 150;
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (_) {}
  }

  function handleVoiceCommand(action) {
    audioSuccess();
    switch (action) {
      case "run_last": {
        const block = get(lastCodeBlock);
        if (block) {
          const lang = (block.language || "").toLowerCase().trim();
          const code = block.code || "";
          const esc = (s) => String(s).replace(/'/g, "'\\''");
          let commandToRun = code;
          if (/^(python|python3|py)$/.test(lang)) {
            commandToRun = `python3 -c '${esc(code)}'`;
          } else if (/^(javascript|js)$/.test(lang)) {
            commandToRun = `node -e '${esc(code)}'`;
          }
          terminalCommand.set(commandToRun);
          terminalOpen.set(true);
          editorOpen.set(false);
        }
        break;
      }
      case "apply_last": {
        const block = get(lastCodeBlock);
        if (block) {
          openInEditorFromChat.set({
            content: block.code,
            language: block.language,
          });
          terminalOpen.set(true);
          editorOpen.set(true);
        }
        break;
      }
      case "fix_error": {
        const banner = get(terminalErrorBanner);
        if (banner) {
          errorFeedbackRequest.set({
            code: banner.code,
            output: banner.output ?? "",
          });
          terminalErrorBanner.set(null);
        }
        break;
      }
      case "show_terminal":
        terminalOpen.set(true);
        editorOpen.set(false);
        break;
      case "show_editor":
        terminalOpen.set(true);
        editorOpen.set(true);
        break;
      case "hide_terminal":
        terminalOpen.set(false);
        break;
      case "hide_editor":
        editorOpen.set(false);
        break;
    }
  }

  function stopRecording() {
    if (recordingTimerId != null) {
      clearTimeout(recordingTimerId);
      recordingTimerId = null;
    }
    // Release microphone immediately so the tab mic indicator goes away
    if (voiceStream) {
      voiceStream.getTracks().forEach((t) => t.stop());
      voiceStream = null;
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    recording = false;
  }

  async function startVoiceInput() {
    const baseUrl =
      get(voiceServerUrl) ??
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("voiceServerUrl")
        : null) ??
      "http://localhost:8765";
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url) {
      voiceError =
        "Set Voice server URL in Settings (e.g. http://localhost:8765)";
      return;
    }
    voiceError = null;
    try {
      // Check server is up before grabbing the mic
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 3000);
      let healthRes;
      try {
        healthRes = await fetch(`${url}/health`, {
          method: "GET",
          signal: ac.signal,
        });
      } catch (he) {
        clearTimeout(to);
        voiceError =
          "Voice server not running. Restart ATOM Code from the desktop launcher, or run the voice server manually: cd voice-server && python3 -m uvicorn app:app --host 0.0.0.0 --port 8765";
        return;
      }
      clearTimeout(to);
      if (!healthRes.ok) {
        voiceError = `Voice server at ${url} returned ${healthRes.status}. Restart ATOM Code or run the voice server manually (see voice-server/README.md).`;
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStream = stream;
      recordingChunks = [];
      const rec = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunks.push(e.data);
      };
      rec.onstop = async () => {
        if (voiceStream) {
          voiceStream.getTracks().forEach((t) => t.stop());
          voiceStream = null;
        }
        if (recordingChunks.length === 0) {
          voiceError = "No audio recorded";
          voiceProcessing = false;
          return;
        }
        const blob = new Blob(recordingChunks, { type: "audio/webm" });
        try {
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          const res = await fetch(`${url}/transcribe`, {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            const err = await res.text();
            throw new Error(err || `Server ${res.status}`);
          }
          const data = await res.json();
          const transcribed = data && data.text ? String(data.text).trim() : "";
          if (!transcribed) {
            audioError();
          } else {
            console.log("[voice] transcribed:", JSON.stringify(transcribed));
            const codingPresets = [
              "Code",
              "Debug",
              "Review",
              "Refactor",
              "Explain",
            ];
            const command = codingPresets.includes(get(activePresetName))
              ? matchVoiceCommand(transcribed)
              : null;
            if (command) {
              console.log(
                "[voice-cmd] matched:",
                command,
                "from:",
                transcribed,
              );
              handleVoiceCommand(command);
              voiceProcessing = false;
              return;
            }
            text = text ? text + " " + transcribed : transcribed;
          }
        } catch (e) {
          voiceError =
            e?.message || "Voice server error. Is it running on " + url + "?";
        } finally {
          voiceProcessing = false;
        }
      };
      rec.start(1000);
      recording = true;
      audioReady();
      recordingStartMs = Date.now();
      voiceProcessing = true;
      recordingTimerId = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    } catch (e) {
      voiceError = e?.message || "Microphone access denied or unavailable";
    }
  }

  function toggleVoice() {
    // Always allow clicking to stop recording (don't block on voiceProcessing)
    if (recording) {
      stopRecording();
      return;
    }
    if (voiceProcessing) return; // still uploading/transcribing
    startVoiceInput();
  }

  /** Guard: true if focus is in an input, textarea, or contenteditable (skip push-to-talk). */
  function isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName && el.tagName.toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  onMount(() => {
    function onKeyDown(e) {
      if ((e.key !== " " && e.code !== "Space") || e.repeat) return;
      if (isInputFocused()) return;
      if (recording || voiceProcessing) return;
      e.preventDefault();
      startVoiceInput();
    }
    function onKeyUp(e) {
      if ((e.key !== " " && e.code !== "Space") || e.repeat) return;
      if (isInputFocused()) return;
      if (!recording) return;
      e.preventDefault();
      stopRecording();
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  });
</script>

<div
  class="chat-input-container"
  ondragover={onDragOver}
  ondrop={onDrop}
  role="presentation"
>
  <input
    bind:this={fileInputEl}
    type="file"
    accept="{ACCEPT_IMAGE},{ACCEPT_PDF},{ACCEPT_VIDEO}"
    multiple
    class="hidden-file-input"
    onchange={onFileInputChange}
    aria-label="Attach image or PDF"
  />
  <div class="chat-input-box">
    <div class="chat-input-main">
      {#if attachments.length > 0}
        <div class="attachments-row px-4 pt-4">
          {#each attachments as att, i}
            <div class="attachment-thumb shadow-sm">
              {#if att.isVideo}
                <div class="thumb-video-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    opacity="0.7"><polygon points="10 8 16 12 10 16" /></svg
                  >
                </div>
              {:else if att.dataUrl.startsWith("data:image")}
                <img src={att.dataUrl} alt="" class="thumb-img" />
              {:else}
                <span class="thumb-placeholder">IMG</span>
              {/if}
              <span class="thumb-label" title={att.label}
                >{att.label.length > 12
                  ? att.label.slice(0, 10) + "…"
                  : att.label}</span
              >
              <button
                type="button"
                class="thumb-remove"
                onclick={() => removeAttachment(i)}
                aria-label="Remove">×</button
              >
            </div>
          {/each}
        </div>
      {/if}
      <textarea
        bind:this={textareaEl}
        bind:value={text}
        onkeydown={handleKeydown}
        oninput={onInputWithMention}
        onpaste={onPaste}
        disabled={$isStreaming ? true : null}
        placeholder={placeholderText}
        rows="1"
        class="w-full bg-transparent px-4 py-3 text-sm focus:outline-none resize-none"
      ></textarea>
      {#if atMentionOpen && atMentionFiles.length > 0}
        <div
          class="at-mention-dropdown"
          role="listbox"
          aria-label="Include file"
        >
          {#each atMentionFiles as file, i}
            <button
              type="button"
              class="at-mention-item"
              class:selected={i === atMentionSelectedIndex}
              role="option"
              aria-selected={i === atMentionSelectedIndex}
              onclick={() => selectMentionFile(file.path)}
            >
              <span class="at-mention-rel">{file.rel}</span>
            </button>
          {/each}
        </div>
      {/if}
      <div
        class="chat-input-footer flex items-center justify-between px-3 pb-3 pt-1"
      >
        <div class="chat-input-footer-icons flex items-center space-x-1">
          <div class="attach-button-wrap relative flex items-center">
            {#if clippyBubble}
              <div class="clippy-bubble" role="status" aria-live="polite">
                <span class="clippy-bubble-text">{clippyBubble}</span>
                <span class="clippy-bubble-tail" aria-hidden="true"></span>
              </div>
            {/if}
            <button
              type="button"
              class="attach-button"
              class:clippy-active={clippyBubble}
              title="Attach image or PDF (or drag & drop, paste)"
              disabled={$isStreaming || attachProcessing}
              onclick={() => fileInputEl?.click()}
              onmouseenter={onAttachHover}
              onmouseleave={onAttachLeave}
              aria-label="Attach files"
            >
              {#if attachProcessing}
                <span class="mic-spinner" aria-hidden="true">⟳</span>
              {:else}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  class="attach-icon"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><path
                    d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                  ></path></svg
                >
              {/if}
            </button>
          </div>
          <div class="media-toolbar inline-flex items-center space-x-1">
            <button
              type="button"
              class="media-icon-btn {imageGenerating
                ? 'media-icon-btn-active'
                : ''}"
              disabled={$isStreaming || imageGenerating || !text.trim()}
              onclick={handleImageClick}
              title={imageGenerating
                ? "Generating image…"
                : onGenerateImageGrok
                  ? "Generate image (Grok)"
                  : "Generate image (DeepInfra)"}
              aria-label={imageGenerating
                ? "Generating image"
                : "Generate image"}
            >
              {#if imageGenerating}
                <ThinkingAtom size={16} />
              {:else}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="2.5"
                    y="2.5"
                    width="19"
                    height="19"
                    rx="3"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                  <circle
                    cx="8"
                    cy="8"
                    r="2"
                    fill="currentColor"
                    opacity="0.5"
                  />
                  <path
                    d="M2.5 16l5-5.5 3.5 3.5 3-3L21.5 16v3.5a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3V16z"
                    fill="currentColor"
                    opacity="0.2"
                  />
                  <path
                    d="M2.5 16l5-5.5 3.5 3.5 3-3L21.5 16"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </button>
            <button
              type="button"
              class="media-icon-btn {videoGenerating
                ? 'media-icon-btn-active'
                : ''}"
              disabled={$isStreaming || videoGenerating || !text.trim()}
              onclick={handleVideoClick}
              title={videoGenerating
                ? `Generating video… ${videoGenElapsed}`
                : "Generate video (DeepInfra)"}
              aria-label={videoGenerating
                ? "Generating video"
                : "Generate video"}
            >
              {#if videoGenerating}
                <span class="media-icon-generating"
                  ><ThinkingAtom size={16} /></span
                >
              {:else}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="2.5"
                    y="3.5"
                    width="19"
                    height="17"
                    rx="3"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                  <path
                    d="M10 8.5v7l5.5-3.5L10 8.5z"
                    fill="currentColor"
                    opacity="0.35"
                  />
                  <path
                    d="M10 8.5v7l5.5-3.5L10 8.5z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </button>
          </div>
          <button
            type="button"
            class="web-search-button"
            class:active={$webSearchForNextMessage}
            title={webSearchWarmingUp
              ? "Connecting…"
              : $webSearchForNextMessage
                ? $webSearchConnected
                  ? "Web search on – connected (click to turn off)"
                  : "Web search on – not connected yet (click globe again to retry)"
                : "Search the web for next message"}
            disabled={$isStreaming}
            onclick={() => {
              const on = $webSearchForNextMessage;
              const connected = $webSearchConnected;
              if (on && !connected && !webSearchWarmingUp) {
                webSearchWarmUpAttempted = false;
                runWarmUp();
                return;
              }
              if (on) {
                webSearchForNextMessage.set(false);
                webSearchConnected.set(false);
                return;
              }
              webSearchForNextMessage.set(true);
              runWarmUp();
            }}
            aria-label={webSearchWarmingUp
              ? "Connecting"
              : $webSearchForNextMessage
                ? "Web search on"
                : "Search web for next message"}
            aria-pressed={$webSearchForNextMessage}
            aria-busy={webSearchWarmingUp}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="web-search-icon"
              class:web-search-icon-spin={webSearchWarmingUp}
              aria-hidden="true"
              title="Internet"
              ><circle cx="12" cy="12" r="10"></circle><line
                x1="2"
                y1="12"
                x2="22"
                y2="12"
              ></line><path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
              ></path></svg
            >
            {#if $webSearchForNextMessage}
              {#if $webSearchConnected}
                <span
                  class="web-search-dot web-search-dot-green"
                  aria-hidden="true"
                  title="Connected"
                ></span>
              {:else}
                <span
                  class="web-search-dot web-search-dot-red"
                  class:web-search-dot-pulse={webSearchWarmingUp}
                  aria-hidden="true"
                  title="Not connected"
                ></span>
              {/if}
            {/if}
          </button>
        </div>
        <div class="chat-input-row flex items-center space-x-3 pr-1">
          <button
            type="button"
            class="mic-button"
            title={recording
              ? "Stop recording (click again)"
              : "Voice input – start Python server first"}
            disabled={$isStreaming || (voiceProcessing && !recording)}
            onclick={toggleVoice}
            aria-label={recording ? "Stop recording" : "Start voice input"}
          >
            {#if voiceProcessing && !recording}
              <span class="mic-spinner" aria-hidden="true">⟳</span>
            {:else if recording}
              <span class="mic-dot" aria-hidden="true"></span>
            {:else}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="mic-icon"
                ><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                ></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line
                  x1="12"
                  y1="19"
                  x2="12"
                  y2="22"
                ></line></svg
              >
            {/if}
          </button>
          <div
            class="relative flex items-center justify-center w-[44px] h-[44px]"
          >
            <div
              class="absolute inset-0 flex items-center justify-center"
              aria-label="Context usage"
              title="Context usage"
            >
              <!-- Use inline=true for contrasting teal color, and a larger size to ring the 36px button -->
              <ContextRing inline={true} size={44} strokeWidth={2.5} />
            </div>
            {#if $isStreaming && onStop}
              <button
                type="button"
                class="chat-send-icon-btn chat-stop-btn relative z-10"
                data-state="stop"
                onclick={() => onStop()}
                title="Stop"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  ><rect x="6" y="6" width="12" height="12" rx="2" /></svg
                >
              </button>
            {:else}
              <button
                class="chat-send-icon-btn relative z-10"
                onclick={handleSubmit}
                disabled={$isStreaming ||
                $webSearchInProgress ||
                (!text.trim() && attachments.length === 0)
                  ? true
                  : null}
                title={$webSearchInProgress
                  ? searchingMessage || "Searching..."
                  : $isStreaming
                    ? sendingMessage || "Sending..."
                    : "Send message"}
              >
                {#if $webSearchInProgress || $isStreaming}
                  <ThinkingAtom size={18} />
                {:else}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><line x1="12" y1="19" x2="12" y2="5"></line><polyline
                      points="5 12 12 5 19 12"
                    ></polyline></svg
                  >
                {/if}
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
  {#if voiceError}
    <p class="voice-error" role="alert">{voiceError}</p>
  {/if}
  {#if attachError}
    <p class="attach-error" role="alert">{attachError}</p>
  {/if}
</div>

<style>
  .chat-input-container {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
  }

  .chat-input-box {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    background-color: var(--glass-bg-hover);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-shadow);
    transition: all var(--duration-normal);
  }

  .chat-input-box:focus-within {
    border-color: var(--glass-border-strong);
  }

  .at-mention-dropdown {
    flex-shrink: 0;
    max-height: 200px;
    overflow-y: auto;
    border-top: 1px solid var(--ui-border, #e5e7eb);
    background: var(--ui-input-bg, #fff);
    border-radius: 0 0 10px 10px;
    padding: 2px 0;
  }

  .at-mention-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    font-size: 13px;
    font-family: ui-monospace, monospace;
    border: none;
    background: transparent;
    color: var(--ui-text-primary, #111);
    cursor: pointer;
  }

  .at-mention-item:hover,
  .at-mention-item.selected {
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 12%, transparent);
  }

  .at-mention-rel {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2) var(--space-2);
    flex-shrink: 0;
  }

  .chat-input-footer-icons {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .chat-input-footer .attach-button-wrap {
    height: 22px;
    min-height: 22px;
  }

  .chat-input-footer .attach-button,
  .chat-input-footer .mic-button,
  .chat-input-footer .web-search-button {
    width: 22px;
    min-width: 22px;
    min-height: 22px;
    padding: 0;
    font-size: 14px;
    border: none;
    background: transparent;
    border-radius: 0;
    opacity: 0.6;
    color: var(--ui-text-secondary, #6b7280);
    transition: opacity var(--duration-normal);
  }

  .chat-input-footer .attach-button:hover:not(:disabled),
  .chat-input-footer .mic-button:hover:not(:disabled),
  .chat-input-footer .web-search-button:hover:not(:disabled) {
    opacity: 1;
    border: none;
    background: transparent;
    color: var(--ui-text-primary);
  }

  .chat-input-footer .web-search-button.active {
    opacity: 1;
    border: none;
    background: transparent;
    color: var(--ui-accent, #3b82f6);
  }

  .chat-input-footer .web-search-dot {
    width: 6px;
    height: 6px;
  }

  .chat-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .chat-input-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1.5px solid var(--ui-input-border, var(--ui-border, #e5e7eb));
    border-radius: 16px;
    background-color: var(--ui-input-bg, #fff);
    transition:
      border-color var(--duration-normal),
      box-shadow var(--duration-normal);
    overflow: hidden;
  }

  .chat-input-main:focus-within {
    border-color: var(--ui-accent, #3b82f6);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--ui-accent, #3b82f6) 12%, transparent);
  }

  textarea {
    flex: 0 0 auto;
    width: 100%;
    padding: 10px 12px;
    border: none;
    font-family: inherit;
    font-size: 14px;
    resize: none;
    min-height: 44px;
    max-height: 200px;
    overflow-y: auto;
    background: transparent;
    color: var(--ui-text-primary, #111);
  }

  textarea:focus {
    outline: none;
  }

  /* Avoid double focus ring (container already has focus-within); prevents horizontal bar artifact when typing */
  .chat-input-box textarea:focus-visible {
    box-shadow: none;
  }

  textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chat-send-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--ui-accent, #3b82f6);
    color: white;
    border: none;
    cursor: pointer;
    transition: all var(--duration-normal);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--ui-accent) 40%, transparent);
  }

  .chat-send-icon-btn:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.05);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--ui-accent) 50%, transparent);
  }

  .chat-send-icon-btn:disabled {
    background: color-mix(in srgb, var(--ui-text-secondary) 20%, transparent);
    color: var(--ui-text-secondary);
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  .chat-stop-btn {
    background: var(--ui-accent-hot, #dc2626);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--ui-accent-hot) 40%, transparent);
  }
  .chat-stop-btn:hover:not(:disabled) {
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--ui-accent-hot) 50%, transparent);
  }

  .media-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .media-toolbar:not(.media-toolbar-dropdown) {
    padding: var(--space-1) var(--space-2) var(--space-2);
  }

  .media-icon-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--ui-text-secondary, #6b7280);
    cursor: pointer;
    transition:
      background var(--duration-normal),
      color var(--duration-normal);
    padding: 0 var(--space-2);
  }

  .media-icon-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 10%, transparent);
    color: var(--ui-accent, #3b82f6);
  }

  .media-icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .media-icon-btn-active:disabled {
    opacity: 1;
    cursor: default;
    color: var(--ui-accent, #3b82f6);
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 8%, transparent);
  }

  .media-icon-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .media-icon-generating {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .media-elapsed {
    font-size: 10px;
    font-weight: 600;
    color: var(--ui-accent, #3b82f6);
    font-variant-numeric: tabular-nums;
  }

  .mic-button {
    flex-shrink: 0;
    width: 28px;
    min-height: 28px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--ui-border, #e5e7eb);
    background: color-mix(in srgb, var(--ui-text-secondary) 6%, transparent);
    color: var(--ui-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    transition: all var(--duration-normal);
  }
  .mic-button:hover:not(:disabled) {
    border-color: var(--ui-accent, #3b82f6);
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 12%, transparent);
    color: var(--ui-text-primary);
  }
  .mic-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .mic-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ui-accent-hot, #dc2626);
    animation: pulse var(--duration-long) var(--ease-in-out) infinite;
  }
  .mic-spinner {
    animation: spin var(--duration-slower) linear infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .voice-recording-hint {
    position: absolute;
    bottom: 100%;
    left: var(--space-4);
    margin-bottom: var(--space-2);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--ui-accent, #3b82f6);
    pointer-events: none;
  }
  .recording-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ui-accent-hot, #ef4444);
    animation: recording-pulse var(--duration-long) var(--ease-in-out) infinite;
  }
  @keyframes recording-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }
  .voice-error,
  .attach-error {
    position: absolute;
    bottom: 100%;
    left: var(--space-4);
    right: 80px;
    margin: 0 0 var(--space-1) 0;
    padding: var(--space-2) var(--space-3);
    font-size: 12px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, #dc2626 15%, var(--ui-bg-main));
    color: var(--ui-text-primary);
    border: 1px solid var(--ui-accent-hot, #dc2626);
  }
  .hidden-file-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .attach-button-wrap {
    position: relative;
    flex-shrink: 0;
    height: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
  }
  .clippy-bubble {
    position: absolute;
    bottom: calc(100% + var(--space-3));
    left: 50%;
    transform: translateX(-50%) scale(0.9);
    animation: clippy-bubble-in var(--duration-slow) var(--ease-out) forwards;
    max-width: 260px;
    z-index: 50;
    pointer-events: none;
  }
  .clippy-bubble-text {
    display: block;
    padding: var(--space-3) var(--space-4);
    font-size: 12px;
    line-height: 1.35;
    border-radius: var(--radius-lg);
    background: var(--ui-bg-main);
    color: var(--ui-text-primary);
    border: 2px solid var(--ui-border);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  }
  .clippy-bubble-tail {
    position: absolute;
    left: 50%;
    bottom: calc(-1 * var(--space-2));
    margin-left: -7px;
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 9px solid var(--ui-border);
  }
  .clippy-bubble-tail::after {
    content: "";
    position: absolute;
    left: -5px;
    top: -10px;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 7px solid var(--ui-bg-main);
  }
  @keyframes clippy-bubble-in {
    0% {
      opacity: 0;
      transform: translateX(-50%) scale(0.85) translateY(6px);
    }
    70% {
      transform: translateX(-50%) scale(1.02) translateY(-1px);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) scale(1) translateY(0);
    }
  }
  .attach-button.clippy-active .attach-icon {
    animation: clippy-wiggle var(--duration-slower) var(--ease-in-out);
  }
  @keyframes clippy-wiggle {
    0%,
    100% {
      transform: rotate(0deg);
    }
    15% {
      transform: rotate(-12deg);
    }
    30% {
      transform: rotate(10deg);
    }
    45% {
      transform: rotate(-8deg);
    }
    60% {
      transform: rotate(4deg);
    }
    75% {
      transform: rotate(-2deg);
    }
  }
  .attach-button {
    flex-shrink: 0;
    width: 28px;
    min-height: 28px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--ui-border, #e5e7eb);
    background: color-mix(in srgb, var(--ui-text-secondary) 6%, transparent);
    color: var(--ui-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    transition: all var(--duration-normal);
  }
  .attach-button:hover:not(:disabled) {
    border-color: var(--ui-accent, #3b82f6);
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 12%, transparent);
    color: var(--ui-text-primary);
  }
  .attach-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .web-search-button {
    position: relative;
    flex-shrink: 0;
    width: 28px;
    min-height: 28px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--ui-border, #e5e7eb);
    background: color-mix(in srgb, var(--ui-text-secondary) 6%, transparent);
    color: var(--ui-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
  }
  .web-search-button:hover:not(:disabled) {
    border-color: var(--ui-accent, #3b82f6);
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 12%, transparent);
    color: var(--ui-text-primary);
  }
  .web-search-button.active {
    border-color: var(--ui-accent, #3b82f6);
    background: color-mix(in srgb, var(--ui-accent, #3b82f6) 14%, transparent);
    color: var(--ui-text-primary);
  }
  .web-search-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .web-search-icon {
    font-size: 0.875rem;
    line-height: 1;
  }
  .web-search-icon-spin {
    animation: web-search-globe-spin var(--duration-long) linear infinite;
  }
  @keyframes web-search-globe-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  .web-search-dot {
    position: absolute;
    bottom: 2px;
    left: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    pointer-events: none;
  }
  .web-search-dot-green {
    background: #22c55e;
  }
  .web-search-dot-red {
    background: #dc2626;
  }
  .web-search-dot-pulse {
    animation: web-search-dot-pulse var(--duration-long) var(--ease-in-out)
      infinite;
  }
  @keyframes web-search-dot-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .attachments-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: flex-start;
  }
  .attachment-thumb {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--ui-border, #e5e7eb);
    background: var(--ui-bg-main);
    flex-shrink: 0;
  }
  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--ui-text-secondary);
    background: var(--ui-input-bg);
  }
  .thumb-video-icon {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ui-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--ui-accent, #3b82f6) 10%,
      var(--ui-input-bg, #fff)
    );
    border-radius: 4px;
  }
  .thumb-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 2px 4px;
    font-size: 9px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .thumb-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb-remove:hover {
    background: var(--ui-accent-hot, #dc2626);
  }
</style>
