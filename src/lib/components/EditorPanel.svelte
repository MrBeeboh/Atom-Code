<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { EditorView, keymap, lineNumbers } from "@codemirror/view";
  import { EditorState, Compartment } from "@codemirror/state";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
  } from "@codemirror/commands";
  import {
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching,
    foldGutter,
  } from "@codemirror/language";
  import { closeBrackets } from "@codemirror/autocomplete";
  import { javascript } from "@codemirror/lang-javascript";
  import { python } from "@codemirror/lang-python";
  import { html } from "@codemirror/lang-html";
  import { css } from "@codemirror/lang-css";
  import { json } from "@codemirror/lang-json";
  import { oneDark } from "@codemirror/theme-one-dark";
  import {
    editorContent,
    editorLanguage,
    editorFilePath,
    terminalCommand,
    terminalOpen,
    editorOpen,
    fileServerUrl,
    openInEditorFromChat,
  } from "$lib/stores.js";

  let containerEl = $state(null);
  let view = $state(null);
  let savedToast = $state(false);
  let savePathPrompt = $state(null);
  let savePathInput = $state("");
  /** When user saves via the system save dialog, we keep the handle for subsequent Saves. */
  let saveFileHandle = $state(null);

  const LANG_MAP = {
    javascript: javascript,
    python: python,
    html: html,
    css: css,
    json: json,
  };

  function langFromPath(path) {
    if (!path) return "javascript";
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(ext))
      return "javascript";
    if (ext === "py") return "python";
    if (["html", "htm", "svelte"].includes(ext)) return "html";
    if (ext === "css") return "css";
    if (ext === "json") return "json";
    return "javascript";
  }

  function getLanguageExtension() {
    const path = get(editorFilePath);
    const lang = path
      ? langFromPath(path)
      : get(editorLanguage) || "javascript";
    return LANG_MAP[lang]?.() ?? javascript();
  }

  const langCompartment = new Compartment();

  function getExtensions() {
    return [
      lineNumbers(),
      foldGutter(),
      history(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      langCompartment.of(getLanguageExtension()),
      bracketMatching(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle),
      oneDark,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && view) {
          const text = update.state.doc.toString();
          editorContent.set(text);
        }
      }),
      EditorView.theme({
        "&": {
          backgroundColor: "var(--editor-bg, var(--ui-code-bg, #1e1e2e))",
        },
        "&.cm-editor .cm-scroller": {
          backgroundColor: "var(--editor-bg, var(--ui-code-bg, #1e1e2e))",
        },
        "&.cm-editor .cm-content": { color: "#d4d4d4" },
        "&.cm-editor .cm-gutters": {
          backgroundColor:
            "color-mix(in srgb, var(--ui-code-bg, #1e1e2e) 85%, black)",
          borderRightColor: "var(--ui-border, #333)",
        },
        "&.cm-editor .cm-activeLineGutter": {
          backgroundColor:
            "color-mix(in srgb, var(--ui-code-bg, #1e1e2e) 75%, black)",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          color: "var(--ui-text-secondary, #6b7280)",
        },
        "&.cm-editor .cm-selectionBackground": {
          backgroundColor: "rgba(var(--ui-accent-rgb, 59, 130, 246), 0.2)",
        },
        ".cm-lineNumbers .cm-activeLineGutter": {
          backgroundColor: "rgba(var(--ui-accent-rgb, 59, 130, 246), 0.2)",
        },
      }),
    ];
  }

  onMount(() => {
    if (!containerEl) return;
    const content = get(editorContent) ?? "";
    const state = EditorState.create({
      doc: content,
      extensions: getExtensions(),
    });
    const editorView = new EditorView({
      state,
      parent: containerEl,
    });
    view = editorView;
    const resizeObserver = new ResizeObserver(() => {
      editorView.requestMeasure();
    });
    resizeObserver.observe(containerEl);
    return () => {
      resizeObserver.disconnect();
      editorView.destroy();
      view = null;
    };
  });

  $effect(() => {
    const request = $openInEditorFromChat;
    if (request) {
      editorContent.set(request.content);
      editorLanguage.set(request.language);
      editorFilePath.set(null);
      saveFileHandle = null;
      openInEditorFromChat.set(null);
    }
  });

  $effect(() => {
    const lang = $editorLanguage;
    const path = $editorFilePath;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.reconfigure(getLanguageExtension()),
    });
  });

  $effect(() => {
    const content = $editorContent;
    if (!view || typeof content !== "string") return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  });

  async function runCode() {
    const path = get(editorFilePath);
    if (!path) {
      alert("Please save the file so it has a path before running it.");
      return;
    }

    // Auto-save the file before running
    await save();

    const lang = langFromPath(path);
    const dir = path.substring(
      0,
      Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")),
    );
    const file = path.substring(
      Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
    );

    const cdCmd = dir ? `cd "${dir}" && ` : "";
    let cmd = "";

    if (lang === "python") {
      cmd = `${cdCmd}python3 "${file}"\n`;
    } else if (lang === "javascript") {
      cmd = `${cdCmd}node "${file}"\n`;
    } else if (["html", "css", "json"].includes(lang)) {
      alert(
        `Files of type ${lang} cannot be directly executed in the terminal.`,
      );
      return;
    } else {
      cmd = `${cdCmd}./"${file}"\n`;
    }

    terminalCommand.set(cmd);
    terminalOpen.set(true);
  }

  function suggestedSaveName() {
    const path = get(editorFilePath);
    if (path?.trim()) {
      const base = path.replace(/^.*[/\\]/, "");
      if (base) return base;
    }
    return "untitled.txt";
  }

  async function save() {
    const content = get(editorContent) ?? "";
    const path = get(editorFilePath)?.trim();
    if (path && (path.startsWith("/") || path.match(/^[A-Za-z]:[\\/]/))) {
      await doSaveViaServer(path, content);
      return;
    }
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        let handle = saveFileHandle;
        if (!handle) {
          // @ts-ignore
          handle = await window.showSaveFilePicker({
            suggestedName: suggestedSaveName(),
            types: [
              {
                description: "Text/Code",
                accept: {
                  "text/*": [
                    ".txt",
                    ".js",
                    ".py",
                    ".html",
                    ".css",
                    ".json",
                    ".md",
                    ".svelte",
                    ".ts",
                    ".tsx",
                    ".jsx",
                  ],
                },
              },
            ],
          });
          saveFileHandle = handle;
          editorFilePath.set(handle.name);
        }
        const w = await handle.createWritable();
        await w.write(content);
        await w.close();
        savedToast = true;
        setTimeout(() => (savedToast = false), 2000);
        savePathPrompt = null;
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error("[EditorPanel] save failed", e);
        alert(e?.message || "Save failed");
        return;
      }
    }
    if (path) {
      await doSaveViaServer(path, content);
      return;
    }
    savePathPrompt = true;
    savePathInput = "";
  }

  async function doSaveViaServer(path, content) {
    const base = (get(fileServerUrl) || "http://localhost:8768").replace(
      /\/$/,
      "",
    );
    try {
      const res = await fetch(`${base}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      savedToast = true;
      setTimeout(() => (savedToast = false), 2000);
      savePathPrompt = null;
    } catch (e) {
      console.error("[EditorPanel] save failed", e);
      alert(e?.message || "Save failed");
    }
  }

  function saveWithPath() {
    const p = savePathInput?.trim();
    if (!p) return;
    doSaveViaServer(p, get(editorContent) ?? "").then(() => {
      editorFilePath.set(p);
      savePathInput = "";
    });
    savePathPrompt = null;
  }

  function copyContent() {
    const content = get(editorContent) ?? "";
    navigator.clipboard.writeText(content).catch(() => {});
  }

  function closePanel(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    editorOpen.set(false);
    terminalOpen.set(false);
  }
</script>

<div
  class="editor-panel flex flex-col h-full min-h-[200px] overflow-hidden"
  style="background: var(--ui-code-bg, #1e1e2e);"
>
  <div
    class="editor-toolbar shrink-0 flex items-center justify-between gap-2 px-2 py-1 border-b"
    style="position: relative; z-index: 5; height: 32px; min-height: 32px; border-color: var(--ui-border); background: var(--ui-bg-sidebar); color: var(--ui-text-secondary);"
  >
    <span
      class="truncate text-xs font-mono"
      style="color: var(--ui-text-primary);"
      title={$editorFilePath || "Untitled"}
    >
      {$editorFilePath || "Untitled"}
    </span>
    <div class="flex items-center gap-1 shrink-0">
      <button
        type="button"
        class="px-2 py-1 rounded text-xs font-medium transition-colors"
        style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
        title="Run in terminal"
        onclick={runCode}>Run</button
      >
      <button
        type="button"
        class="px-2 py-1 rounded text-xs font-medium transition-colors"
        style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
        title="Save to file"
        onclick={save}>Save</button
      >
      <button
        type="button"
        class="px-2 py-1 rounded text-xs font-medium transition-colors"
        style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
        title="Copy to clipboard"
        onclick={copyContent}>Copy</button
      >
      <button
        type="button"
        class="editor-toolbar-close shrink-0 flex items-center justify-center rounded text-xs transition-colors"
        style="color: var(--ui-text-secondary); min-width: 28px; min-height: 28px; width: 28px; height: 28px; pointer-events: auto;"
        title="Close panel (Ctrl+`)"
        aria-label="Close terminal and editor panel"
        onclick={closePanel}>✕</button
      >
    </div>
  </div>
  <div
    class="editor-container flex-1 min-h-[200px] overflow-auto relative"
    style="z-index: 0;"
    bind:this={containerEl}
  ></div>
  {#if savedToast}
    <div
      class="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded text-xs font-medium"
      style="background: var(--ui-accent); color: white;"
    >
      Saved!
    </div>
  {/if}
  {#if savePathPrompt}
    <div
      class="absolute inset-0 flex items-center justify-center z-10"
      style="background: rgba(0,0,0,0.5);"
      role="dialog"
      aria-label="Save file"
    >
      <div
        class="rounded-lg border p-4 shadow-xl max-w-sm w-full mx-2"
        class="glass-modal"
      >
        <p class="text-sm mb-2" style="color: var(--ui-text-primary);">
          Enter absolute path to save (file server):
        </p>
        <input
          type="text"
          class="w-full rounded border px-3 py-2 text-sm font-mono mb-3"
          style="background: var(--ui-input-bg); border-color: var(--ui-border); color: var(--ui-text-primary);"
          placeholder="/path/to/file.js"
          bind:value={savePathInput}
          onkeydown={(e) => {
            if (e.key === "Escape") savePathPrompt = null;
            if (e.key === "Enter") saveWithPath();
          }}
        />
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            class="px-3 py-1.5 rounded text-sm"
            style="color: var(--ui-text-secondary); border: 1px solid var(--ui-border);"
            onclick={() => {
              savePathPrompt = null;
              savePathInput = "";
            }}>Cancel</button
          >
          <button
            type="button"
            class="px-3 py-1.5 rounded text-sm font-medium"
            style="background: var(--ui-accent); color: white;"
            onclick={saveWithPath}>Save</button
          >
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .editor-panel {
    position: relative;
  }
  .editor-container :global(.cm-editor) {
    height: 100%;
    min-height: 200px;
  }
  .editor-container :global(.cm-scroller) {
    min-height: 200px;
    overflow: auto;
  }
  .editor-container :global(.cm-editor) {
    max-height: 100%;
  }
  .editor-toolbar-close:hover {
    color: var(--ui-text-primary);
    background: color-mix(in srgb, var(--ui-accent) 12%, transparent);
  }
</style>
