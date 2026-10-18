import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The installable app, and a service worker that keeps a copy of it so it opens offline (DESIGN.md §11). Only
    // production builds register it (src/app/pwa.ts); `npm run dev` never does.
    VitePWA({
      // A new version waits for the writer to reload, rather than reloading under them.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'bookbookbook',
        short_name: 'bookbookbook',
        description: 'Plan your novel chapter by chapter, then write each chapter with your plan beside the page.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // The light theme's header and background (src/index.css); the page's theme-color meta follows the theme.
        theme_color: '#fbf8f2',
        background_color: '#f4efe6',
        // Made from public/favicon.svg by `npm run icons`.
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // The glob below already has them.
      includeManifestIcons: false,
      workbox: {
        // The app, its fonts and icons, and the one SQLite build that the browser storage in use loads. PowerSync
        // also ships encrypted builds and one for OPFS storage, 4.9 MB more, which this app never loads.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', '**/wa-sqlite-async-*.wasm'],
        // That build is 2.3 MB, over Workbox's 2 MiB limit.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Every address in the app is the same page, so any of them opens offline.
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // PowerSync starts its SQLite worker with `new URL('./worker.js', import.meta.url)`, which pre-bundling would break.
  // Same settings as PowerSync's own Vite demos.
  optimizeDeps: {
    exclude: ['@powersync/web'],
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
