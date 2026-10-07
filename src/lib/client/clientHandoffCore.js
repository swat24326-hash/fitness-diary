/**
 * Вход значка на iPhone (без React). Safari кладёт одноразовое приглашение в адрес /me?h=… и в manifest;
 * значок открывается с ним, своей сессии у него нет — гасим приглашение через /me/join.
 * Сервер: api/_lib/clientPortal/clientHandoffCore.js.
 */
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/
const REUSE_MARGIN_MS = 60 * 60 * 1000

export function handoffTokenFromSearch(search) {
  const t = new URLSearchParams(String(search ?? '')).get('h') ?? ''
  return TOKEN.test(t) ? t : ''
}

/** Адрес страницы в Safari, который iPhone запомнит для значка. */
export function clientHandoffPageUrl(token) {
  return TOKEN.test(String(token ?? '')) ? `/me?h=${token}` : '/me'
}

/** @returns {string | null} manifest клуба с входом значка; без manifest клуба — null. */
export function withHandoffManifest(manifestUrl, token) {
  if (!manifestUrl) return null
  return TOKEN.test(String(token ?? '')) ? `${manifestUrl}&h=${token}` : manifestUrl
}

/**
 * Что делать при запуске с ?h=…
 * @returns {'redeem' | 'strip' | 'none'} redeem — значок без входа; strip — вход уже есть, убрать из адреса;
 *   none — Safari: адрес не трогаем, его запомнит «На экран Домой».
 */
export function handoffLaunchAction({ standalone, hasSession, token }) {
  if (!token || !standalone) return 'none'
  return hasSession ? 'strip' : 'redeem'
}

/** Сохранённое приглашение ещё годится (с запасом в час), иначе берём новое. */
export function reusableHandoff(saved, nowMs = Date.now()) {
  if (!saved || !TOKEN.test(String(saved.token ?? ''))) return null
  const exp = Date.parse(String(saved.expires_at ?? ''))
  return Number.isFinite(exp) && exp - REUSE_MARGIN_MS > nowMs ? saved.token : null
}
