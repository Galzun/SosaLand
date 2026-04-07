import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Прокси перенаправляет запросы /api/... с фронтенда (порт 5173) на бэкенд (порт 3001).
    // Это позволяет избежать CORS-проблем в разработке:
    //   fetch('/api/auth/login') → http://localhost:3001/api/auth/login
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true, // меняет заголовок Host на target — нужно для корректной работы
      },
      // Проксируем запросы к загруженным изображениям на бэкенд.
      // /uploads/... → http://localhost:3001/uploads/...
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
