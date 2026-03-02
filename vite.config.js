import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: true,
    proxy: {
      '/api/lmstudio': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/lmstudio/, ''),
      },
      '/api/hf': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hf/, ''),
      },
      '/api/ollama': {
        target: 'https://registry.ollama.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
      '/api/search': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/api/health': { target: 'http://localhost:5174', changeOrigin: true },
      '/api/set-key': { target: 'http://localhost:5174', changeOrigin: true },
    },
  },
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
    },
  },
})
