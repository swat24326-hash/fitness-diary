/**
 * Сборка index.html: vite-plugin-pwa всегда дописывает свой <link rel="manifest"> в конец head,
 * даже если ссылка уже есть. Оставляем одну — первую (/manifest.json?v=3): её подменяет /me
 * на manifest клуба (useClientBranding). Со второй ссылкой iPhone ставил значок клиента со стартом «/» — вход зала.
 */
const MANIFEST_LINK = /<link\b[^>]*\brel=["']manifest["'][^>]*>/gi

export function keepFirstManifestLink(html) {
  let seen = false
  return String(html).replace(MANIFEST_LINK, (tag) => {
    if (seen) return ''
    seen = true
    return tag
  })
}

export function countManifestLinks(html) {
  return (String(html).match(MANIFEST_LINK) || []).length
}
