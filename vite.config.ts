import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { diagramFiles } from './vite-diagrams'

// 5817 on purpose: nothing else claims it, and strictPort means a clash fails loudly.
export default defineConfig({
  plugins: [react(), diagramFiles()],
  server: { port: 5817, strictPort: true, host: true },
  preview: { port: 5817, strictPort: true, host: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
