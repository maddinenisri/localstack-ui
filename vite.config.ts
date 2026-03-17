import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/_aws': {
        target: 'http://localhost:4566',
        changeOrigin: true,
      },
      '/_localstack': {
        target: 'http://localhost:4566',
        changeOrigin: true,
      },
    },
  },
})
