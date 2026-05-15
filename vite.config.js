import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifestFilename: 'manifest.json',
      includeAssets: [
        'icons/icon-72.png',
        'icons/icon-96.png',
        'icons/icon-128.png',
        'icons/icon-144.png',
        'icons/icon-152.png',
        'icons/icon-192.png',
        'icons/icon-384.png',
        'icons/icon-512.png',
      ],
      manifest: {
        name: 'FIT-CITY Дневник тренировок',
        short_name: 'FIT-CITY',
        description: 'Дневник тренировок для фитнес-клуба',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            /* PostgREST / Auth / Edge — не кэшировать в SW (сессия и ответы API) */
            urlPattern: ({ url }) => /\.supabase\.co$/i.test(url.hostname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) =>
              request.destination === 'script' ||
              request.destination === 'style' ||
              request.destination === 'image' ||
              request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      // В dev-режиме service worker часто даёт “белый экран” из-за кэша.
      devOptions: {
        enabled: mode === 'production',
      },
    }),
  ],
}))
