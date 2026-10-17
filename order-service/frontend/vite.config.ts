import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/order-assets/' : '/',
  plugins: [react()],
  build: { outDir: 'dist/order-assets' },
  server: {
    port: 5176,
    proxy: { '/api': 'http://localhost:8082' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}))
