<script>
  import { get } from 'svelte/store';
  import { activeConversationId, activeMessages, streamingContent, conversations, settings, effectiveModelId, isStreaming, chatError, chatCommand, pendingDroppedFiles, webSearchForNextMessage, webSearchInProgress, webSearchConnected, grokApiKey, deepinfraApiKey, uiTheme, contextUsage, summarizeAndContinueTrigger, errorFeedbackRequest } from '$lib/stores.js';
  import { getMessages, addMessage, clearMessages, deleteMessage, getMessageCount, createConversation } from '$lib/db.js';
  import { streamChatCompletionWithMetrics } from '$lib/streamReporter.js';
  import { requestGrokImageGeneration, requestDeepInfraImageGeneration, requestDeepInfraVideoGeneration, isGrokModel, isDeepSeekModel, requestChatCompletion } from '$lib/api.js';
  import { searchDuckDuckGo, formatSearchResultForChat } from '$lib/duckduckgo.js';
  import { pinnedFiles, fileServerUrl, repoMapText, repoMapFileList, githubToken, messagePreparing } from '$lib/stores.js';
import { findRelevantFiles } from '$lib/repoMap.js';
import { injectGitHubContextIfPresent } from '$lib/github.js';
  import MessageList from '$lib/components/MessageList.svelte';
  import QuickActions from '$lib/components/QuickActions.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import AtomLogo from '$lib/components/AtomLogo.svelte';
  import { generateId, resizeImageDataUrlsForVision, shouldSkipImageResizeForVision } from '$lib/utils.js';

  const convId = $derived($activeConversationId);

  $effect(() => {
    const msgs = $activeMessages;
    const cid = convId;
    if (!cid || !msgs?.length) {
      contextUsage.update((u) => ({ ...u, promptTokens: 0 }));
      return;
    }
    const lastWithStats = [...msgs].reverse().find((m) => m.role === 'assistant' && m.stats?.prompt_tokens != null);
    const pt = lastWithStats?.stats?.prompt_tokens;
    if (typeof pt === 'number' && pt >= 0) {
      contextUsage.update((u) => ({ ...u, promptTokens: pt }));
    } else {
      const estimated = estimatePromptTokens(msgs.map((m) => ({ role: m.role, content: m.content })));
      if (estimated > 0) contextUsage.update((u) => ({ ...u, promptTokens: estimated }));
    }
  });

  $effect(() => {
    const trigger = $summarizeAndContinueTrigger;
    if (trigger > 0) {
      summarizeAndContinueTrigger.set(0);
      runSummarizeAndContinue();
    }
  });

  $effect(() => {
    const req = $errorFeedbackRequest;
    if (!req?.code) return;
    errorFeedbackRequest.set(null);
    const msg = `The following code failed when I ran it:\n\n\`\`\`\n${req.code}\n\`\`\`\n\nError output:\n\n\`\`\`\n${(req.output || '').trim()}\n\`\`\`\n\nPlease fix the code.`;
    sendUserMessage(msg).catch((e) => {
      console.error('[ChatView] Error feedback send failed:', e);
      chatError.set(e?.message || 'Failed to send error to model.');
    });
  });

  async function runSummarizeAndContinue() {
    if (!convId || !$effectiveModelId) return;
    const msgs = await getMessages(convId);
    if (msgs.length < 2) {
      chatError.set('Need at least 2 messages to summarize.');
      return;
    }
    chatError.set(null);
    const text = msgs
      .map((m) => {
        const c = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map((p) => (p.type === 'text' ? p.text : '')).join('') : '');
        return `${m.role}: ${(c || '').slice(0, 2000)}`;
      })
      .join('\n\n');
    const toSend = text.slice(-80000);
    try {
      const { content: summary } = await requestChatCompletion({
        model: $effectiveModelId,
        messages: [
          { role: 'system', content: 'Summarize this conversation for continuity in a new chat. Include: key decisions, code or file references, and what we were working on. Be concise (a short paragraph or bullet list).' },
          { role: 'user', content: toSend },
        ],
        options: { max_tokens: 1024, temperature: 0.3 },
      });
      const newId = await createConversation();
      await addMessage(newId, { role: 'system', content: `Previous conversation summary:\n\n${(summary || '').trim()}` });
      activeConversationId.set(newId);
      const { listConversations } = await import('$lib/db.js');
      const list = await listConversations();
      const withCount = await Promise.all(list.map(async (c) => ({ ...c, messageCount: await getMessageCount(c.id) })));
      conversations.set(withCount);
      contextUsage.set({ promptTokens: 0, contextMax: 128000 });
      await loadMessages(newId);
    } catch (e) {
      chatError.set(e?.message || 'Summarize failed.');
    }
  }

  let chatAbortController = $state(null);
  let imageGenerating = $state(false);

  /** Image options modal. Verified config from docs/image-models-and-settings-for-verification.json (Together AI, 2026-02-15). Grok unchanged. */
  const ENGINE_OPTIONS = [
    { label: 'FLUX.1 Schnell', model: 'black-forest-labs/FLUX.1-schnell' },
    { label: 'FLUX.1 Dev', model: 'black-forest-labs/FLUX.1-dev' },
    { label: 'FLUX.1 Pro', model: 'black-forest-labs/FLUX.1-pro' },
  ];
  const STEP_OPTIONS_PER_ENGINE = [
    [{ label: 'Minimal', steps: 1 }, { label: 'Quick', steps: 2 }, { label: 'Standard', steps: 4 }],
    [{ label: 'Quick', steps: 20 }, { label: 'Standard', steps: 25 }, { label: 'Detailed', steps: 30 }, { label: 'High Detail', steps: 50 }],
    [{ label: 'Standard', steps: 25 }, { label: 'Detailed', steps: 30 }, { label: 'High Detail', steps: 50 }],
  ];
  const SIZE_OPTIONS_PER_ENGINE = [
    [{ label: '1:1 Square', width: 1024, height: 1024 }, { label: 'Portrait', width: 1152, height: 896 }, { label: 'Landscape', width: 896, height: 1152 }, { label: 'Wide', width: 1280, height: 768 }],
    [{ label: '1:1 Square', width: 1024, height: 1024 }, { label: 'Portrait', width: 1152, height: 896 }, { label: 'Wide', width: 1344, height: 768 }, { label: 'Panoramic', width: 1728, height: 1152 }],
    [{ label: '1:1 Square', width: 1024, height: 1024 }, { label: 'Large Square', width: 2000, height: 2000 }, { label: '16:9 Widescreen', width: 1820, height: 1024 }],
  ];
  const N_OPTIONS = [1, 2, 4];
  let imageModalOpen = $state(false);
  let imageModalPrompt = $state('');
  let imageModalEngine = $state(0);
  let imageModalQuality = $state(2);
  let imageModalSize = $state(0);
  let imageModalN = $state(0);
  const imageModalQualityOptions = $derived(STEP_OPTIONS_PER_ENGINE[imageModalEngine] ?? STEP_OPTIONS_PER_ENGINE[0]);
  const imageModalSizeOptions = $derived(SIZE_OPTIONS_PER_ENGINE[imageModalEngine] ?? SIZE_OPTIONS_PER_ENGINE[0]);
  const canGenerateImage = $derived(imageModalPrompt.trim().length > 0);

  /** DeepInfra model IDs (official docs). Our ENGINE_OPTIONS use dot (FLUX.1); DeepInfra uses hyphen (FLUX-1). */
  const DEEPINFRA_MODEL_IDS = ['black-forest-labs/FLUX-1-schnell', 'black-forest-labs/FLUX-1-dev', 'black-forest-labs/FLUX-1-dev'];
  const getDeepinfraImageKey = () => (get(deepinfraApiKey)?.trim() || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEEPINFRA_API_KEY) || '').trim();

  /** Video modal (DeepInfra). Per spec: prompt only; no other params. */
  const VIDEO_ENGINE_OPTIONS = [
    { label: 'Wan2.1 1.3B', modelId: 'Wan-AI/Wan2.1-T2V-1.3B' },
    { label: 'Wan2.1 14B', modelId: 'Wan-AI/Wan2.1-T2V-14B' },
    { label: 'Pixverse HD', modelId: 'Pixverse/Pixverse-T2V-HD' },
    { label: 'Veo 3.1 Fast', modelId: 'google/veo-3.1-fast' },
  ];
  let videoModalOpen = $state(false);
  let videoModalPrompt = $state('');
  let videoModalEngine = $state(0);
  let videoGenerating = $state(false);
  let videoGenStartMs = $state(0);
  let videoGenElapsed = $state('');
  let videoGenTimerId = $state(null);

  $effect(() => {
    if (videoGenerating) {
      videoGenStartMs = Date.now();
      videoGenElapsed = '0:00';
      videoGenTimerId = setInterval(() => {
        const sec = Math.floor((Date.now() - videoGenStartMs) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        videoGenElapsed = `${m}:${s.toString().padStart(2, '0')}`;
      }, 1000);
    } else {
      if (videoGenTimerId) clearInterval(videoGenTimerId);
      videoGenTimerId = null;
      videoGenElapsed = '';
    }
    return () => {
      if (videoGenTimerId) clearInterval(videoGenTimerId);
      videoGenTimerId = null;
    };
  });

  $effect(() => {
    const qOpts = imageModalQualityOptions;
    const qMax = qOpts.length - 1;
    if (qMax >= 0 && imageModalQuality > qMax) imageModalQuality = qMax;
    const sOpts = imageModalSizeOptions;
    const sMax = sOpts.length - 1;
    if (sMax >= 0 && imageModalSize > sMax) imageModalSize = sMax;
  });

  async function loadMessages(id = convId) {
    if (!id) {
      activeMessages.set([]);
      return;
    }
    const msgs = await getMessages(id);
    activeMessages.set(msgs);
  }

  $effect(() => {
    loadMessages(convId);
  });

  $effect(() => {
    const cmd = $chatCommand;
    if (!cmd?.type || !convId) return;
    if (cmd.type === 'clear') {
      clearChat();
    } else if (cmd.type === 'export') {
      exportChat();
    }
    chatCommand.set(null);
  });

  async function exportChat() {
    if (!convId) return;
    const msgs = await getMessages(convId);
    const lines = msgs.map((m) => `**${m.role}:**\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n---\n\n');
    const blob = new Blob([lines], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${convId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Sanitize content so we never re-send huge base64 images in history (avoids API "data did not match" / oversized body). */
  function sanitizeContentForApi(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return content;
    return content.map((part) => {
      if (part?.type === 'text' && typeof part.text === 'string') return part;
      if (part?.type === 'image_url') return { type: 'text', text: '[Image attached]' };
      return part;
    });
  }

  function buildApiMessages(msgs, systemPrompt) {
    const sanitized = msgs.map((m, i) => ({
      role: m.role,
      content: i === msgs.length - 1 ? m.content : sanitizeContentForApi(m.content),
    }));
    const out = sanitized.filter((m) => {
      if (m.role === 'system') return true;
      if (typeof m.content === 'string') return m.content.trim().length > 0;
      if (Array.isArray(m.content)) return m.content.length > 0;
      return false;
    });
    if (systemPrompt?.trim()) out.unshift({ role: 'system', content: systemPrompt.trim() });
    return out;
  }

  /** Rough token count for context ring when API doesn't return usage (e.g. LM Studio stream). */
  function estimatePromptTokens(messages) {
    let chars = 0;
    for (const m of messages || []) {
      if (typeof m.content === 'string') chars += m.content.length;
      else if (Array.isArray(m.content)) for (const p of m.content) chars += (p?.text ?? '').length;
    }
    return Math.max(0, Math.ceil(chars / 4));
  }

  async function sendUserMessage(text, imageDataUrls = [], videoDataUrls = [], mentionedFilePaths = []) {
    const hasText = (text || '').trim().length > 0;
    const hasImages = imageDataUrls?.length > 0;
    const hasVideos = videoDataUrls?.length > 0;
    if (!convId || (!hasText && !hasImages && !hasVideos)) return;
    chatError.set(null);
    if (!$effectiveModelId) {
      chatError.set('Please select a model from the dropdown above.');
      return;
    }

    messagePreparing.set(true);
    let effectiveText = (text || '').trim();
    if (get(webSearchForNextMessage) && hasText) {
      // Stay connected: don't turn off webSearchForNextMessage after send.
      // User toggles it off manually via the globe button.
      webSearchInProgress.set(true);
      try {
        const searchResult = await searchDuckDuckGo(effectiveText);
        webSearchConnected.set(true);
        const formatted = formatSearchResultForChat(effectiveText, searchResult);
        effectiveText = formatted + '\n\n---\nUser question: ' + effectiveText;
      } catch (e) {
        webSearchConnected.set(false);
        chatError.set(e?.message || 'Web search failed. Click the globe to retry or send without internet.');
        webSearchInProgress.set(false);
        messagePreparing.set(false);
        throw e; // Propagate so ChatInput restores the user's typed message.
      }
      webSearchInProgress.set(false);
    }

    // Vision: skip resize for Qwen-VL 4B/8B; otherwise resize when payload > 1 MB
    const skipResize = shouldSkipImageResizeForVision($effectiveModelId);
    const urlsForApi = hasImages
      ? (skipResize ? imageDataUrls : await resizeImageDataUrlsForVision(imageDataUrls))
      : [];
    const userContent = hasImages
      ? [
          ...(effectiveText ? [{ type: 'text', text: effectiveText }] : [{ type: 'text', text: ' ' }]),
          ...urlsForApi.map((url) => ({
            type: 'image_url',
            image_url: { url, ...(skipResize ? {} : { detail: 'low' }) },
          })),
        ]
      : effectiveText;

    // Phase 10A: If message contains a GitHub URL, fetch repo context (tree + key files)
    let githubContext = '';
    try {
      githubContext = await injectGitHubContextIfPresent(effectiveText, get(githubToken) || undefined);
    } catch (e) {
      console.warn('[ChatView] GitHub context fetch failed:', e?.message);
    }

    // Prepend pinned file contents as context when sending (file server is 8768; 8766 is unload helper)
    let fileContext = '';
    let fileServerBase = (get(fileServerUrl) || 'http://localhost:8768').replace(/\/$/, '');
    if (fileServerBase.includes(':8766')) fileServerBase = fileServerBase.replace(':8766', ':8768');

    const pinned = get(pinnedFiles) || [];
    const pinnedSet = new Set(pinned.map((p) => (p || '').trim().replace(/:(\d+)$/, '')));

    // Phase 9B: Smart context — auto-include up to 3 relevant files by keyword match
    const repoList = get(repoMapFileList) || [];
    const smartPaths = findRelevantFiles(effectiveText, repoList, 3).filter((p) => !pinnedSet.has(p));
    const pathsToFetch = [...pinned];
    for (const p of smartPaths) {
      if (pathsToFetch.length >= 8) break;
      if (!pathsToFetch.includes(p)) pathsToFetch.push(p);
    }
    // Phase 9C: @file mentions — explicitly included files (deduped)
    const mentioned = [...new Set((mentionedFilePaths || []).map((p) => (p || '').trim()))].filter(Boolean);
    for (const p of mentioned) {
      const pathForFetch = p.replace(/:(\d+)$/, '');
      if (pathForFetch && !pathsToFetch.includes(pathForFetch)) pathsToFetch.push(pathForFetch);
    }

    if (pathsToFetch.length > 0) {
      const fileContextParts = await Promise.all(
        pathsToFetch.map(async (filePath) => {
          const pathForFetch = (typeof filePath === 'string' && filePath.trim())
            ? filePath.trim().replace(/:(\d+)$/, '')  // strip :line for file server
            : '';
          if (!pathForFetch || pathForFetch.includes('%') || !pathForFetch.startsWith('/')) return null;
          if (pathForFetch.includes('.code-workspace') || pathForFetch.includes('/.cursor/projects/')) return null;
          try {
            const res = await fetch(`${fileServerBase}/content?path=${encodeURIComponent(pathForFetch)}`);
            if (!res.ok) {
              console.warn('[ChatView] File fetch failed (kept in pinned):', pathForFetch, res.status);
              return null;
            }
            const data = await res.json();
            return data?.content != null ? `--- ${pathForFetch} ---\n${data.content}` : null;
          } catch (e) {
            console.warn('[ChatView] File fetch error (kept in pinned):', pathForFetch, e);
            return null;
          }
        })
      );
      fileContext = fileContextParts.filter(Boolean).join('\n\n');
    }

    const history = await getMessages(convId);
    await addMessage(convId, {
      role: 'user',
      content: userContent,
      videoUrls: hasVideos ? [...videoDataUrls] : undefined,
    });
    await loadMessages();
    let lastUserContent = userContent;
    const contextPrefix = [githubContext, fileContext].filter(Boolean).join('\n\n');
    if (contextPrefix) {
      const contextIntro = 'Optional context (pinned files, etc.). Use it only if the user\'s message below asks about code or these files. Otherwise answer the user\'s message directly.\n\n--- Context ---\n';
      const userLabel = '\n\n--- User message ---\n';
      if (typeof userContent === 'string') {
        lastUserContent = contextIntro + contextPrefix + userLabel + (userContent || '');
      } else if (Array.isArray(userContent)) {
        const textPart = userContent.find((p) => p.type === 'text');
        const rest = userContent.filter((p) => p.type !== 'text');
        const userText = (textPart?.text ?? '').trim() || '(no text)';
        const text = contextIntro + contextPrefix + userLabel + userText;
        lastUserContent = [{ type: 'text', text }, ...rest];
      }
    }
    const msgsForApi = [...history, { role: 'user', content: lastUserContent }];
    // Phase 9A: Inject repo map into system prompt for codebase awareness (read settings at send time so preset changes apply without refresh)
    const currentSettings = get(settings);
    const systemPromptRaw = (currentSettings?.system_prompt || '').trim();
    const repoMap = (get(repoMapText) || '').trim();
    const repoMapInstruction = 'Answer the user\'s message directly. Use the project structure below only when the user asks about the codebase or specific files.';
    const systemPrompt = repoMap
      ? (systemPromptRaw ? systemPromptRaw + '\n\n' + repoMapInstruction + '\n\n' + repoMap : repoMapInstruction + '\n\n' + repoMap)
      : systemPromptRaw;
    const apiMessages = buildApiMessages(msgsForApi, systemPrompt);
    const estimatedPromptTokens = estimatePromptTokens(apiMessages);

    const assistantMsgId = generateId();
    const assistantPlaceholder = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      stats: null,
      modelId: $effectiveModelId,
      createdAt: Date.now(),
      imageRefs: [],
    };
    activeMessages.update((arr) => [...arr, assistantPlaceholder]);
    streamingContent.set('');

    isStreaming.set(true);
    let fullContent = '';
    const streamImageRefs = [];
    const controller = new AbortController();
    chatAbortController = controller;

    let streamResult;
    try {
      streamResult = await streamChatCompletionWithMetrics({
        model: $effectiveModelId,
        messages: apiMessages,
        options: {
          temperature: currentSettings.temperature,
          max_tokens: currentSettings.max_tokens,
          top_p: currentSettings.top_p,
          top_k: currentSettings.top_k,
          repeat_penalty: currentSettings.repeat_penalty,
          presence_penalty: currentSettings.presence_penalty,
          frequency_penalty: currentSettings.frequency_penalty,
          stop: currentSettings.stop?.length ? currentSettings.stop : undefined,
          ttl: currentSettings.model_ttl_seconds,
        },
        signal: controller.signal,
        onChunk(chunk) {
          fullContent += chunk;
          streamingContent.set(fullContent);
        },
        onImageRef(ref) {
          if (ref?.image_id) {
            streamImageRefs.push({ image_id: ref.image_id, size: (ref && 'size' in ref ? ref.size : undefined) || 'LARGE' });
          }
        },
        onDone() {
          chatAbortController = null;
        },
      });
    } catch (err) {
      const raw = err?.message || '';
      const isLoadError = raw.includes('Failed to load model') || raw.includes('Error loading model');
      const friendly = isLoadError
        ? 'Model failed to load in LM Studio. Load the model in LM Studio first (or check memory). If it still fails, try re-downloading the model in case the file is corrupted.'
        : raw || 'Failed to get response. Is your model server running and the model loaded?';
      chatError.set(friendly);
      activeMessages.update((arr) => arr.filter((m) => m.id !== assistantMsgId));
      return;
    } finally {
      chatAbortController = null;
      streamingContent.set('');
      messagePreparing.set(false);
      isStreaming.set(false);
    }

    if (streamResult?.aborted) return;

    activeMessages.update((arr) => {
      const out = [...arr];
      const last = out[out.length - 1];
      if (last && last.role === 'assistant') out[out.length - 1] = { ...last, content: fullContent, imageRefs: streamImageRefs.length ? [...streamImageRefs] : last.imageRefs };
      return out;
    });

    const completionTokens = streamResult?.usage?.completion_tokens ?? Math.max(1, Math.ceil(fullContent.length / 4));
    const elapsedMs = streamResult?.elapsedMs ?? 0;
    const stats =
      elapsedMs > 0
        ? {
            completion_tokens: completionTokens,
            elapsed_ms: elapsedMs,
            prompt_tokens: streamResult?.usage?.prompt_tokens ?? undefined,
            estimated: streamResult?.usage?.completion_tokens == null,
          }
        : null;
    await addMessage(convId, { role: 'assistant', content: fullContent, modelId: $effectiveModelId, stats, imageRefs: streamImageRefs.length ? streamImageRefs : undefined }, assistantMsgId);
    await loadMessages();

    const promptTokens = typeof streamResult?.usage?.prompt_tokens === 'number' && streamResult.usage.prompt_tokens >= 0
      ? streamResult.usage.prompt_tokens
      : estimatedPromptTokens;
    contextUsage.update((u) => ({ ...u, promptTokens }));

    const conv = $conversations.find((c) => c.id === convId);
    if (conv && conv.title === 'New chat' && fullContent) {
      const title = fullContent.slice(0, 50).replace(/\n/g, ' ').trim() || 'Chat';
      const { updateConversation } = await import('$lib/db.js');
      await updateConversation(convId, { title });
      const { listConversations } = await import('$lib/db.js');
      const list = await listConversations();
      const withCount = await Promise.all(list.map(async (c) => ({ ...c, messageCount: await getMessageCount(c.id) })));
      conversations.set(withCount);
    }
  }

  async function clearChat() {
    if (!convId) return;
    await clearMessages(convId);
    await loadMessages();
  }

  /** Grok image only. Separate code path; does not touch DeepSeek. */
  async function handleGrokImage(prompt) {
    if (!convId) {
      chatError.set('Start or select a conversation first.');
      return;
    }
    if (!get(grokApiKey)?.trim()) {
      chatError.set('Grok API key required. Add it in Settings → Cloud APIs.');
      return;
    }
    chatError.set(null);
    imageGenerating = true;
    try {
      const data = await requestGrokImageGeneration({ prompt, n: 1, aspect_ratio: '1:1', resolution: '1k', response_format: 'url' });
      const urls = data?.data?.map((d) => d?.url).filter(Boolean) ?? [];
      if (urls.length === 0) {
        chatError.set('Image generation failed—no URLs returned. Try text mode.');
        return;
      }
      const modelId = get(effectiveModelId);
      await addMessage(convId, {
        role: 'assistant',
        content: 'Generated images for your prompt.',
        imageUrls: urls,
        modelId: modelId || 'grok:grok-imagine-image',
      });
      await loadMessages();
    } catch (err) {
      chatError.set(err?.message ?? 'Image generation failed—try text mode.');
    } finally {
      imageGenerating = false;
    }
  }

  /** DeepSeek image flow: open options modal. Uses DeepInfra (single key for image + video). */
  function openImageOptionsModal(prompt) {
    if (!convId) {
      chatError.set('Start or select a conversation first.');
      return;
    }
    const key = getDeepinfraImageKey();
    if (!key) {
      chatError.set('DeepInfra API key required. Add it in Settings → Cloud APIs.');
      return;
    }
    chatError.set(null);
    imageModalPrompt = (prompt || '').trim() || '';
    imageModalOpen = true;
  }

  function closeImageModal() {
    imageModalOpen = false;
  }

  /** Generate image via DeepInfra (synchronous; response.images[0] base64 → data URL). */
  async function handleImageModalGenerate() {
    if (!convId || !imageModalPrompt.trim()) return;
    const key = getDeepinfraImageKey();
    if (!key) {
      chatError.set('DeepInfra API key required.');
      return;
    }
    const modelId = DEEPINFRA_MODEL_IDS[imageModalEngine] ?? DEEPINFRA_MODEL_IDS[0];
    const qualityOpts = STEP_OPTIONS_PER_ENGINE[imageModalEngine] ?? STEP_OPTIONS_PER_ENGINE[0];
    const quality = qualityOpts[Math.min(imageModalQuality, qualityOpts.length - 1)] ?? qualityOpts[0];
    const sizeOpts = SIZE_OPTIONS_PER_ENGINE[imageModalEngine] ?? SIZE_OPTIONS_PER_ENGINE[0];
    const size = sizeOpts[Math.min(imageModalSize, sizeOpts.length - 1)] ?? sizeOpts[0];
    const n = N_OPTIONS[imageModalN] ?? 1;
    closeImageModal();
    imageGenerating = true;
    chatError.set(null);
    try {
      const data = await requestDeepInfraImageGeneration({
        apiKey: key,
        modelId,
        prompt: imageModalPrompt,
        num_images: n,
        num_inference_steps: quality?.steps ?? 4,
        guidance_scale: 7.5,
        width: size.width ?? 1024,
        height: size.height ?? 1024,
      });
      const urls = data?.data?.map((d) => d?.url).filter(Boolean) ?? [];
      if (urls.length === 0) {
        chatError.set('Image generation failed—no images returned.');
        return;
      }
      const modelIdEffective = get(effectiveModelId);
      const imageUrlsToStore = [...urls];
      await addMessage(convId, {
        role: 'assistant',
        content: 'Generated images for your prompt.',
        imageUrls: imageUrlsToStore,
        modelId: modelIdEffective || 'deepseek:deepseek-chat',
      });
      await loadMessages();
    } catch (err) {
      chatError.set(err?.message ?? 'Image generation failed.');
    } finally {
      imageGenerating = false;
    }
  }

  /** Video: open modal (prompt + model). */
  function openVideoModal(prompt) {
    if (!convId) {
      chatError.set('Start or select a conversation first.');
      return;
    }
    const key = getDeepinfraImageKey();
    if (!key) {
      chatError.set('DeepInfra API key required. Add it in Settings → Cloud APIs.');
      return;
    }
    chatError.set(null);
    videoModalPrompt = (prompt || '').trim() || '';
    videoModalOpen = true;
  }

  function closeVideoModal() {
    videoModalOpen = false;
  }

  /** Generate video via DeepInfra (synchronous; response.video_url or response.videos → full URL). */
  async function handleVideoModalGenerate() {
    if (!convId || !videoModalPrompt.trim()) return;
    const key = getDeepinfraImageKey();
    if (!key) {
      chatError.set('DeepInfra API key required.');
      return;
    }
    const engine = VIDEO_ENGINE_OPTIONS[videoModalEngine];
    const modelId = engine?.modelId ?? VIDEO_ENGINE_OPTIONS[0].modelId;
    closeVideoModal();
    videoGenerating = true;
    chatError.set(null);
    try {
      // DeepInfra video: ONLY prompt. Do not pass width, height, duration, negative_prompt, or any other field.
      const data = await requestDeepInfraVideoGeneration({
        apiKey: key,
        modelId,
        prompt: videoModalPrompt,
      });
      const videoUrl = data?.videoUrl;
      if (!videoUrl) {
        chatError.set('Video generation failed—no video URL returned.');
        return;
      }
      const elapsedSec = Math.round((Date.now() - videoGenStartMs) / 1000);
      const elapsedMin = Math.floor(elapsedSec / 60);
      const elapsedRemSec = elapsedSec % 60;
      const elapsedStr = elapsedMin > 0
        ? `${elapsedMin}m ${elapsedRemSec}s`
        : `${elapsedSec}s`;
      const modelIdEffective = get(effectiveModelId);
      await addMessage(convId, {
        role: 'assistant',
        content: `Generated video (${elapsedStr}).`,
        videoUrls: [String(videoUrl)],
        modelId: modelIdEffective || 'deepseek:deepseek-chat',
      });
      await loadMessages();
    } catch (err) {
      chatError.set(err?.message ?? 'Video generation failed.');
    } finally {
      videoGenerating = false;
    }
  }
</script>

<div
  class="flex-1 flex flex-col min-h-0 chat-drop-zone"
  role="application"
  ondragover={(e) => { e.preventDefault(); e.stopPropagation(); }}
  ondrop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files?.length) pendingDroppedFiles.set(files);
  }}
>
  <!-- Image options modal (DeepSeek/Together flow): engine, quality, size, n → Generate -->
  {#if imageModalOpen}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background: rgba(0,0,0,0.5);"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-modal-title"
    >
      <div class="w-full max-w-md rounded-xl shadow-xl p-5 flex flex-col gap-4" style="background: var(--ui-bg-main); border: 1px solid var(--ui-border);">
        <h2 id="image-modal-title" class="text-lg font-semibold" style="color: var(--ui-text-primary);">Generate image</h2>
        <div>
          <label for="image-modal-prompt" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Prompt</label>
          <textarea
            id="image-modal-prompt"
            bind:value={imageModalPrompt}
            rows="3"
            class="w-full rounded border px-3 py-2 text-sm resize-none"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
            placeholder="Describe the image you want"
          ></textarea>
        </div>
        <div>
          <label for="image-modal-engine" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Choose Image Engine</label>
          <select
            id="image-modal-engine"
            bind:value={imageModalEngine}
            class="w-full rounded border px-3 py-2 text-sm"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
          >
            {#each ENGINE_OPTIONS as opt, i}
              <option value={i}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="image-modal-quality" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Quality / Steps</label>
          <select
            id="image-modal-quality"
            bind:value={imageModalQuality}
            class="w-full rounded border px-3 py-2 text-sm"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
          >
            {#each imageModalQualityOptions as opt, i}
              <option value={i}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="image-modal-size" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Size</label>
          <select
            id="image-modal-size"
            bind:value={imageModalSize}
            class="w-full rounded border px-3 py-2 text-sm"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
          >
            {#each imageModalSizeOptions as opt, i}
              <option value={i}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="image-modal-n" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Number of images</label>
          <select
            id="image-modal-n"
            bind:value={imageModalN}
            class="w-full rounded border px-3 py-2 text-sm"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
          >
            {#each N_OPTIONS as num, i}
              <option value={i}>{num}</option>
            {/each}
          </select>
        </div>
        <div class="flex gap-2 justify-end pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium"
            style="background: var(--ui-input-bg); border: 1px solid var(--ui-border); color: var(--ui-text-primary);"
            onclick={closeImageModal}
          >Cancel</button>
          <button
            type="button"
            class="image-modal-generate-btn px-4 py-2 rounded-lg text-sm font-medium"
            style="background: var(--ui-accent);"
            onclick={handleImageModalGenerate}
            disabled={imageGenerating || !canGenerateImage}
          >{imageGenerating ? 'Generating…' : 'Generate'}</button>
        </div>
      </div>
    </div>
  {/if}
  <!-- Video options modal (DeepInfra): prompt + model → Generate -->
  {#if videoModalOpen}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background: rgba(0,0,0,0.5);"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
    >
      <div class="w-full max-w-md rounded-xl shadow-xl p-5 flex flex-col gap-4" style="background: var(--ui-bg-main); border: 1px solid var(--ui-border);">
        <h2 id="video-modal-title" class="text-lg font-semibold" style="color: var(--ui-text-primary);">Generate video</h2>
        <div>
          <label for="video-modal-prompt" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Prompt</label>
          <textarea
            id="video-modal-prompt"
            bind:value={videoModalPrompt}
            rows="3"
            class="w-full rounded border px-3 py-2 text-sm resize-none"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
            placeholder="Describe the video you want"
          ></textarea>
        </div>
        <div>
          <label for="video-modal-engine" class="block text-sm font-medium mb-1" style="color: var(--ui-text-secondary);">Model</label>
          <select
            id="video-modal-engine"
            bind:value={videoModalEngine}
            class="w-full rounded border px-3 py-2 text-sm"
            style="border-color: var(--ui-border); background: var(--ui-input-bg); color: var(--ui-text-primary);"
          >
            {#each VIDEO_ENGINE_OPTIONS as opt, i}
              <option value={i}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <p class="text-xs" style="color: var(--ui-text-secondary);">Video can take 5–10+ minutes. Please wait—do not close the tab.</p>
        <div class="flex gap-2 justify-end pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium"
            style="background: var(--ui-input-bg); border: 1px solid var(--ui-border); color: var(--ui-text-primary);"
            onclick={closeVideoModal}
          >Cancel</button>
          <button
            type="button"
            class="video-modal-generate-btn px-4 py-2 rounded-lg text-sm font-medium"
            style="background: var(--ui-accent);"
            onclick={handleVideoModalGenerate}
            disabled={videoGenerating || !videoModalPrompt.trim()}
          >{videoGenerating ? 'Generating…' : 'Generate'}</button>
        </div>
      </div>
    </div>
  {/if}
  <div class="chat-view-content flex flex-col min-h-0">
  {#if convId}
    {#if $activeMessages.length === 0}
      <!-- Greeting + input: centered column 56rem, pushed down from top -->
      <div class="ui-splash-wrap flex-1 flex flex-col min-h-0 pt-16 md:pt-24">
        <div class="flex-1 flex flex-col items-center justify-center min-h-0 px-4 w-full max-w-[56rem] mx-auto">
          <h1 class="ui-greeting-title text-2xl md:text-3xl font-semibold text-center mb-2" style="color: var(--ui-text-primary);">What can I help with?</h1>
          {#if $chatError}
            <div class="mt-4 w-full px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between gap-2">
              <span>{$chatError}</span>
              <button type="button" class="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30" onclick={() => chatError.set(null)} aria-label="Dismiss">×</button>
            </div>
          {/if}
        </div>
        <div class="shrink-0 w-full max-w-[56rem] mx-auto px-4 pb-6">
          <ChatInput
              onSend={sendUserMessage}
              onStop={() => chatAbortController?.abort?.()}
              onGenerateImageGrok={$effectiveModelId && isGrokModel($effectiveModelId) && $grokApiKey?.trim() ? handleGrokImage : undefined}
              onGenerateImageDeepSeek={getDeepinfraImageKey() ? openImageOptionsModal : undefined}
              onGenerateVideoDeepSeek={getDeepinfraImageKey() ? openVideoModal : undefined}
              imageGenerating={imageGenerating}
              videoGenerating={videoGenerating}
              videoGenElapsed={videoGenElapsed}
              placeholder="Ask anything. Type or paste here... (Ctrl+Enter to send)"
            />
        </div>
      </div>
    {:else}
      <!-- After first message: centered column 56rem, messages, quick actions, input -->
      <div class="flex-1 overflow-y-auto min-h-0 chat-scroll-area">
        <MessageList />
      </div>
      <div class="shrink-0 chat-input-dock pt-4 pb-5">
        <div class="chat-column max-w-[56rem] mx-auto w-full px-4 flex flex-col gap-2">
          {#if $chatError}
            <div class="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between gap-2">
              <span>{$chatError}</span>
              <button type="button" class="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30" onclick={() => chatError.set(null)} aria-label="Dismiss">×</button>
            </div>
          {/if}
          <QuickActions />
          <div class="w-full min-w-0">
            <ChatInput
            onSend={sendUserMessage}
            onStop={() => chatAbortController?.abort?.()}
            onGenerateImageGrok={$effectiveModelId && isGrokModel($effectiveModelId) && $grokApiKey?.trim() ? handleGrokImage : undefined}
            onGenerateImageDeepSeek={getDeepinfraImageKey() ? openImageOptionsModal : undefined}
            onGenerateVideoDeepSeek={getDeepinfraImageKey() ? openVideoModal : undefined}
            imageGenerating={imageGenerating}
            videoGenerating={videoGenerating}
            videoGenElapsed={videoGenElapsed}
          />
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex-1 flex items-center justify-center p-8">
      <div class="text-center max-w-sm">
        <p class="text-xl font-semibold text-zinc-800 dark:text-zinc-200">Start a conversation</p>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Create a new chat from the sidebar or select an existing one.</p>
      </div>
    </div>
  {/if}
  </div>
</div>
