import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
