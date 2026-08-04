import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** Локальный `npm run dev`: куда проксировать `/api`. Переопределение — VITE_DEV_API_PROXY. */
const DEFAULT_DEV_API_PROXY = 'https://fitness-diary-bice.vercel.app'
const devApiProxyTarget = process.env.VITE_DEV_API_PROXY?.trim() || DEFAULT_DEV_API_PROXY

/** Время сборки — попадает в Диагностику рядом с id бандла. */
const appBuildTimeIso = new Date().toISOString()

export default defineConfig(({ mode }) => ({
  define: {
    __FITNESS_DIARY_BUILD_TIME__: JSON.stringify(appBuildTimeIso),
  },
  server:
    mode === 'development'
      ? {
          // Windows: иначе Vite часто слушает только [::1], а браузер бьёт в 127.0.0.1 → ERR_CONNECTION_REFUSED
          host: '127.0.0.1',
          port: 5173,
          strictPort: true,
          proxy: {
            '/api': {
              target: devApiProxyTarget,
              changeOrigin: true,
              secure: true,
            },
          },
        }
      : undefined,
  plugins: [
    {
      name: 'fitness-diary-build-meta',
      transformIndexHtml(html) {
        return html.replace(
          '<title>Ось</title>',
          `<meta name="fitness-diary-build-time" content="${appBuildTimeIso}" />\n    <title>Ось</title>`,
        )
      },
    },
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
        name: 'Ось',
        short_name: 'Ось',
        description: 'Операционная система фитнес-клуба: зал, продажи, управление',
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
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          /* Supabase (PostgREST / Auth) — не регистрировать в SW: иначе при сбое сети Workbox
             отдаёт no-response вместо нормальной ошибки fetch, и приложение «висит» на загрузке. */
          {
            /* JS: не CacheFirst — иначе после деплоя HTML-fallback 404 кэшируется как «скрипт». */
            urlPattern: ({ request }) => request.destination === 'script',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'assets-scripts',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || !response.ok) return null
                    const ct = String(response.headers.get('content-type') || '')
                    if (ct.includes('text/html')) return null
                    return response
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ request }) =>
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
