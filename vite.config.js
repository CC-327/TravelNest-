import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      manifest: {
        name: 'TravelNest 途忆记',
        short_name: '途忆记',
        description: '离线可用的旅行日记应用',
        theme_color: '#42b983',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,ico,png,svg}']
      }
    })
  ]
})