import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend URL — override with VITE_BACKEND_URL env var if needed
// e.g. VITE_BACKEND_URL=http://192.168.1.10:8000 npm run dev
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000'
const backendWsUrl = backendUrl.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': backendUrl,
      '/screenshots': backendUrl,
      '/ws': {
        target: backendWsUrl,
        ws: true
      }
    }
  }
})
