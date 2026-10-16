/**
 * Закрытие /privacy|/chat-rules|/offer: куда вернуться после крестика.
 * Не используем слепой history.back() — в стеке часто чужой /trainer/profile.
 */

/** Безопасный внутренний путь для возврата (без // и чужих схем). */
export function isSafeLegalReturnTo(raw) {
  if (typeof raw !== 'string') return false
  const t = raw.trim()
  return t.startsWith('/') && !t.startsWith('//') && !t.includes('://')
}

/**
 * state для Link на legal-страницу.
 * @param {{ pathname?: string, search?: string, fromProfile?: boolean }} p
 */
export function legalLinkNavState({ pathname = '/', search = '', fromProfile = false } = {}) {
  const path = String(pathname || '/').startsWith('/') ? String(pathname || '/') : '/'
  const q = typeof search === 'string' && search.startsWith('?') ? search : ''
  return {
    legalReturnTo: `${path}${q}`,
    reopenMyProfile: Boolean(fromProfile),
  }
}

/**
 * @param {{
 *   state?: { legalReturnTo?: string, reopenMyProfile?: boolean } | null,
 *   hasOpener?: boolean,
 *   fallbackHome?: string,
 * }} p
 *   fallbackHome — куда при прямом заходе (ярлык с /privacy|/chat-rules): клиент с сессией/кэшем → /me/, иначе «/».
 * @returns {{ action: 'return' | 'close' | 'home', to?: string, reopenMyProfile?: boolean }}
 */
export function resolveLegalClose({ state = null, hasOpener = false, fallbackHome = '/' } = {}) {
  const raw = typeof state?.legalReturnTo === 'string' ? state.legalReturnTo.trim() : ''
  if (isSafeLegalReturnTo(raw)) {
    return {
      action: 'return',
      to: raw,
      reopenMyProfile: Boolean(state?.reopenMyProfile),
    }
  }
  if (hasOpener) return { action: 'close' }
  const home = isSafeLegalReturnTo(fallbackHome) ? fallbackHome.trim() : '/'
  return { action: 'home', to: home }
}

/** Прямой заход на юр.страницу (ярлык «Домой» с правил) — показать выход в приложение клиента. */
export function legalNeedsAppEntry({ hasReturnTo }) {
  return !hasReturnTo
}

/** @deprecated — см. resolveLegalClose */
export function legalPageCloseAction({ historyLength, hasOpener }) {
  if (hasOpener && !(Number(historyLength) > 1)) return 'close'
  if (Number(historyLength) > 1) return 'back'
  if (hasOpener) return 'close'
  return 'login'
}
