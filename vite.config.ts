import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/_aws_api': {
        target: 'http://localhost:4566',
        changeOrigin: true,
        rewrite: (path) => {
          // /_aws_api/sns/?Action=... -> /?Action=...
          // Set Host header to route to the correct service
          const match = path.match(/^\/_aws_api\/([^/]+)\/(.*)/)
          return match ? `/${match[2]}` : path
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const match = req.url?.match(/^\/_aws_api\/([^/]+)\//)
            if (match) {
              proxyReq.setHeader('Host', `${match[1]}.us-east-1.localhost.localstack.cloud`)
            }
          })
        },
      },
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
