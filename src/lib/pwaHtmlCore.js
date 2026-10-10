/**
 * Сборка index.html: vite-plugin-pwa всегда дописывает <link rel="manifest" href="/manifest.json"> в head.
 * Статичной ссылки быть не должно: manifest зала ставит public/manifest-boot.js — везде, кроме /me.
 * iPhone берёт manifest с загрузки страницы: с manifest зала значок клиента открывал вход сотрудника (INC-2026-10-10-01).
 */
const MANIFEST_LINK = /\s*<link\b[^>]*\brel=["']manifest["'][^>]*>/gi

export function dropManifestLinks(html) {
  return String(html).replace(MANIFEST_LINK, '')
}

export function countManifestLinks(html) {
  return (String(html).match(MANIFEST_LINK) || []).length
}
