<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { Terminal } from 'xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import 'xterm/css/xterm.css';
  import { terminalOpen, terminalServerUrl, terminalCommand } from '$lib/stores.js';

  const DANGEROUS_PATTERNS = [
    /\brm\s+(-rf?|--recursive)/i,
    /\bsudo\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    />\s*\/dev\//i,
    /\bchmod\s+777/i,
    /\bcurl\b.*\|\s*(bash|sh)/i,
    /\bwget\b.*\|\s*(bash|sh)/i,
  ];

  function isDangerous(command) {
    return DANGEROUS_PATTERNS.some((p) => p.test(command));
  }

  let containerEl = $state(null);
  let terminal = $state(null);
  let fitAddon = $state(null);
  let ws = $state(null);
  let connected = $state(false);
  let pendingDangerousCommand = $state(null);

  let unsubCommand = null;

  function connect() {
    const url = get(terminalServerUrl) || 'ws://localhost:8767';
    try {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        connected = true;
        if (fitAddon) fitAddon.fit();
        if (terminal) terminal.focus();
        trySendPendingCommand();
      };
      socket.onclose = () => {
        connected = false;
        ws = null;
      };
      socket.onerror = () => {
        connected = false;
      };
      socket.onmessage = (ev) => {
        if (terminal && typeof ev.data === 'string') terminal.write(ev.data);
        else if (terminal && ev.data instanceof ArrayBuffer) terminal.write(new Uint8Array(ev.data));
      };
      ws = socket;
    } catch (_) {
      connected = false;
    }
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  /** Send pending terminalCommand if WebSocket is open; clear after sending. Only for Run-button-injected commands; dangerous ones require confirm. */
  function trySendPendingCommand() {
    const code = get(terminalCommand);
    if (code == null || code === '') return;
    terminalCommand.set(null);
    if (isDangerous(code)) {
      pendingDangerousCommand = code;
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      send(code + '\n');
    }
  }

  function confirmRunDangerous() {
    if (pendingDangerousCommand && ws && ws.readyState === WebSocket.OPEN) {
      send(pendingDangerousCommand + '\n');
    }
    pendingDangerousCommand = null;
  }

  function cancelDangerous() {
    pendingDangerousCommand = null;
  }

  function clearTerminal() {
    if (terminal) terminal.clear();
  }

  onMount(() => {
    if (!containerEl) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      theme: {
        background: 'var(--ui-bg-main, #1e1e1e)',
        foreground: 'var(--ui-text-primary, #d4d4d4)',
        cursor: 'var(--ui-accent, #0ea5e9)',
        cursorAccent: 'var(--ui-bg-main, #1e1e1e)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    try {
      term.loadAddon(new WebLinksAddon());
    } catch (_) {}
    term.open(containerEl);
    terminal = term;
    fitAddon = fit;
    fit.fit();
    term.onData((data) => send(data));
    term.focus();

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon) {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && ws && ws.readyState === WebSocket.OPEN) {
          send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }
    });
    resizeObserver.observe(containerEl);

    unsubCommand = terminalCommand.subscribe(() => {
      trySendPendingCommand();
    });

    connect();
    trySendPendingCommand();

    return () => {
      resizeObserver.disconnect();
      unsubCommand?.();
      if (ws) {
        ws.close();
        ws = null;
      }
      term?.dispose();
      terminal = null;
      fitAddon = null;
    };
  });
</script>

<div class="terminal-panel" style="position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--ui-bg-main); border-top: 1px solid var(--ui-border);">
  {#if pendingDangerousCommand}
    <div
      class="dangerous-cmd-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dangerous-cmd-title"
      style="position: absolute; inset: 0; z-index: 100; background: color-mix(in srgb, var(--ui-bg-main) 85%, transparent); display: flex; align-items: center; justify-content: center; padding: 1rem;"
    >
      <div
        class="dangerous-cmd-dialog"
        style="background: var(--ui-bg-sidebar); border: 1px solid var(--ui-border); border-radius: 8px; padding: 1rem 1.25rem; max-width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);"
      >
        <p id="dangerous-cmd-title" style="font-weight: 600; color: var(--ui-text-primary); margin-bottom: 0.5rem;">
          ⚠️ This command may be destructive:
        </p>
        <p style="font-family: var(--font-mono, monospace); font-size: 0.85rem; color: var(--ui-text-secondary); margin-bottom: 1rem; word-break: break-all;">
          {pendingDangerousCommand.slice(0, 100)}{pendingDangerousCommand.length > 100 ? '…' : ''}
        </p>
        <p style="font-size: 0.8rem; color: var(--ui-text-secondary); margin-bottom: 1rem;">Run anyway?</p>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button
            type="button"
            style="padding: 0.35rem 0.75rem; border-radius: 4px; border: 1px solid var(--ui-border); background: transparent; color: var(--ui-text-secondary); cursor: pointer; font-size: 0.85rem;"
            onclick={cancelDangerous}
          >Cancel</button>
          <button
            type="button"
            style="padding: 0.35rem 0.75rem; border-radius: 4px; border: none; background: var(--ui-accent); color: white; cursor: pointer; font-size: 0.85rem;"
            onclick={confirmRunDangerous}
          >Run</button>
        </div>
      </div>
    </div>
  {/if}
  <div class="terminal-toolbar" style="display: flex; align-items: center; justify-content: space-between; padding: 0.25rem 0.5rem; background: color-mix(in srgb, var(--ui-bg-sidebar) 90%, transparent); border-bottom: 1px solid var(--ui-border); font-size: 0.75rem; color: var(--ui-text-secondary);">
    <span class="terminal-title">Terminal</span>
    <div class="terminal-toolbar-actions" style="display: flex; align-items: center; gap: 0.25rem;">
      <button
        type="button"
        class="terminal-toolbar-btn"
        title="Clear"
        aria-label="Clear terminal"
        onclick={clearTerminal}
        style="padding: 0.2rem 0.4rem; border-radius: 4px; background: transparent; border: none; cursor: pointer; color: var(--ui-text-secondary); font-size: 0.8rem;"
      >Clear</button>
      <button
        type="button"
        class="terminal-toolbar-btn"
        title="Close (Ctrl+`)"
        aria-label="Close terminal"
        onclick={() => terminalOpen.set(false)}
        style="padding: 0.2rem 0.4rem; border-radius: 4px; background: transparent; border: none; cursor: pointer; color: var(--ui-text-secondary); font-size: 0.8rem;"
      >✕</button>
    </div>
  </div>
  <div
    class="terminal-container"
    role="application"
    aria-label="Integrated terminal"
    style="flex: 1; min-height: 0; padding: 0.25rem; pointer-events: auto; cursor: text;"
    bind:this={containerEl}
    onclick={() => terminal?.focus()}
  ></div>
</div>
