import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8081'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: true, proxy: { '/api': apiProxyTarget } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
})
