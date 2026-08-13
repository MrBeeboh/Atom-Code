<!--
  RailMenu: hamburger pinned to the bottom of the left rail.
  Always visible (collapsed or expanded) so Settings / API keys stay reachable.
-->
<script>
  import {
    openSettings,
    shortcutsModalOpen,
    themePickerOpen,
  } from "$lib/stores.js";

  let { expanded = false } = $props();

  let menuOpen = $state(false);
  let buttonEl = $state(/** @type {HTMLButtonElement | null} */ (null));
  let menuEl = $state(/** @type {HTMLDivElement | null} */ (null));
  let menuPos = $state({ top: 8, left: 52 });

  const items = [
    {
      id: "apikeys",
      label: "API keys",
      hint: "Cloud models, search, GitHub",
      run: () => openSettings("apikeys"),
    },
    {
      id: "connection",
      label: "Connection",
      hint: "LM Studio, voice, workspace",
      run: () => openSettings("connection"),
    },
    {
      id: "settings",
      label: "All settings",
      hint: "Audio, performance, presets",
      run: () => openSettings(),
    },
    {
      id: "theme",
      label: "Theme",
      hint: "Color theme picker",
      run: () => themePickerOpen.set(true),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      hint: "Ctrl+K, [, ], ?",
      run: () => shortcutsModalOpen.set(true),
    },
  ];

  function positionMenu() {
    const r = buttonEl?.getBoundingClientRect();
    if (!r) return;
    const gap = 8;
    const estimatedHeight = 280;
    const estimatedWidth = 240;
    let top = r.bottom - estimatedHeight;
    if (top < gap) top = gap;
    if (top + estimatedHeight > window.innerHeight - gap) {
      top = Math.max(gap, window.innerHeight - estimatedHeight - gap);
    }
    let left = r.right + gap;
    if (left + estimatedWidth > window.innerWidth - gap) {
      left = Math.max(gap, r.left - estimatedWidth - gap);
    }
    menuPos = { top, left };
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
    if (menuOpen) positionMenu();
  }

  function closeMenu() {
    menuOpen = false;
  }

  function runItem(run) {
    closeMenu();
    run();
  }

  $effect(() => {
    if (!menuOpen) return;
    positionMenu();
    function onPointerDown(e) {
      const t = /** @type {Node | null} */ (e.target);
      if (buttonEl?.contains(t) || menuEl?.contains(t)) return;
      closeMenu();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        buttonEl?.focus();
      }
    }
    function onResize() {
      positionMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  });
</script>

<div class="rail-menu-wrap" class:expanded>
  <button
    type="button"
    class="rail-menu-btn"
    class:open={menuOpen}
    bind:this={buttonEl}
    onclick={toggleMenu}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-label="Settings menu"
    title="Settings"
  >
    <svg
      class="rail-menu-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
    {#if expanded}
      <span class="rail-menu-btn-label">Settings</span>
    {:else}
      <span class="rail-icon-label">Menu</span>
    {/if}
  </button>
</div>

{#if menuOpen}
  <div
    bind:this={menuEl}
    class="rail-menu-popover"
    style="top: {menuPos.top}px; left: {menuPos.left}px;"
    role="menu"
    aria-label="Settings menu"
  >
    <p class="rail-menu-heading">Settings</p>
    {#each items as item (item.id)}
      <button
        type="button"
        class="rail-menu-item"
        role="menuitem"
        onclick={() => runItem(item.run)}
      >
        <span class="rail-menu-item-label">{item.label}</span>
        <span class="rail-menu-item-hint">{item.hint}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .rail-menu-wrap {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    padding: 6px 2px 8px;
    border-top: 1px solid var(--ui-border);
  }
  .rail-menu-wrap.expanded {
    justify-content: stretch;
    padding: 6px 8px 8px;
  }
  .rail-menu-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 40px;
    padding: 6px 0;
    border: none;
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: var(--ui-text-secondary);
    cursor: pointer;
    transition:
      background var(--duration-normal, 150ms),
      color var(--duration-normal, 150ms);
  }
  .rail-menu-wrap.expanded .rail-menu-btn {
    flex-direction: row;
    width: 100%;
    gap: 8px;
    padding: 8px 10px;
    justify-content: flex-start;
  }
  .rail-menu-btn:hover,
  .rail-menu-btn.open {
    background: color-mix(in srgb, var(--ui-accent) 12%, transparent);
    color: var(--ui-text-primary);
  }
  .rail-menu-btn:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 2px;
  }
  .rail-menu-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  .rail-menu-btn-label {
    font-size: 12px;
    font-weight: 600;
  }
  .rail-icon-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1;
    opacity: 0.85;
  }
  .rail-menu-popover {
    position: fixed;
    z-index: 130;
    width: 240px;
    padding: 6px;
    border-radius: 12px;
    border: 1px solid var(--glass-border, var(--ui-border));
    background: var(--glass-bg, var(--ui-bg-sidebar));
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  }
  .rail-menu-heading {
    margin: 0;
    padding: 6px 10px 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ui-text-secondary);
  }
  .rail-menu-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--ui-text-primary);
    cursor: pointer;
    text-align: left;
  }
  .rail-menu-item:hover,
  .rail-menu-item:focus-visible {
    background: color-mix(in srgb, var(--ui-accent) 14%, transparent);
    outline: none;
  }
  .rail-menu-item-label {
    font-size: 13px;
    font-weight: 600;
  }
  .rail-menu-item-hint {
    font-size: 11px;
    color: var(--ui-text-secondary);
  }
</style>
