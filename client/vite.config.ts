import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api requests to the Express backend so the browser sees a
    // same-origin response.  Cross-origin fetch streams are subject to
    // extra browser-level buffering; same-origin streams are delivered to
    // the ReadableStream immediately.
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
