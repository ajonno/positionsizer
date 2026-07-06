import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

export default defineConfig({
  server: {
    proxy: {
      '/trading-api': {
        target: process.env.VITE_TRADING_API_PROXY_TARGET || 'http://localhost:5229',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/trading-api/, ''),
      },
      '/portfolio-bridge': {
        target: process.env.VITE_PORTFOLIO_BRIDGE_PROXY_TARGET || 'http://127.0.0.1:5174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/portfolio-bridge/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Position Sizer',
        short_name: 'PosSizer',
        description: 'Calculate position sizes for crypto and equity trades',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
})
