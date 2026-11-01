import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // API-anrop går till servern i server/index.ts (npm run server).
    proxy: { '/api': 'http://localhost:8787' },
  },
})
