/**
 * Manifest приложения клиента под клуб: на телефоне значок называется как клуб, а не «Ядро».
 * Браузер берёт manifest без токена, поэтому в ответе только публичное: название клуба и наши иконки.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME_MAX = 40
export const CLIENT_APP_FALLBACK_NAME = 'Мои тренировки'

export function cleanClubName(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  return s.slice(0, NAME_MAX).trim()
}

/** @returns {string | null} null — id не похож на клуб, manifest не отдаём. */
export function clientManifestUrl(clubId) {
  const id = String(clubId ?? '').trim()
  return UUID.test(id) ? `/api/client-me?manifest=${id}` : null
}

export function isClientManifestClubId(raw) {
  return UUID.test(String(raw ?? '').trim())
}

/** @param {string} [startUrl] /me?h=… — вход значка на iPhone (clientHandoffCore.js) */
export function buildClientManifest(clubName, startUrl = '/me') {
  const name = cleanClubName(clubName) || CLIENT_APP_FALLBACK_NAME
  return {
    name,
    short_name: name,
    description: 'Абонемент, ближайшая тренировка, прогресс и бонусы клуба',
    id: '/me/',
    start_url: startUrl,
    scope: '/me',
    display: 'standalone',
    theme_color: '#0a0a0a',
    background_color: '#0a0a0a',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png' },
    ],
  }
}
