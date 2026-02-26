# Tooling setup (already installed)

Vitest and ESLint are already in the project. You ran the install (or the script did).

## What’s in the project

- **Vitest** – `npm run test` (watch) / `npm run test:run` (once)
- **ESLint** – `npm run lint` (Svelte + JS)
- **One-time script** – `install-tooling.bat` runs `npm install` and `npm run test:run`

## Cursor / VS Code (do once by hand)

1. **Extensions** (Extensions panel → search → Install):
   - **Svelte**: `svelte.svelte-vscode`
   - **Svelte 5 Snippets**: `macosta.sv5s` (optional)

2. **MCP** (optional, for browser testing / docs):
   - Open Cursor Settings → MCP (or edit `%USERPROFILE%\.cursor\mcp.json`).
   - Add a Playwright server if you want browser automation; example config:
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["-y", "@playwright/test", "install", "--with-deps"]
       }
     }
   }
   ```
   (Check Cursor’s MCP docs for the exact config format; the above is a placeholder.)

## Lint

There are a few existing lint findings (unused variables, `{@html}` in one component). Fix them when you touch those files, or run `npm run lint` to see the list.
