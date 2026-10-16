/**
 * Удобство переключения страниц: жест «назад» и кнопки «←» не должны
 * открывать только что закрытый экран и не уводить «в никуда».
 *
 * Правила:
 * 1) Нет слепого «шаг назад» по истории в UI (кроме комментариев).
 * 2) «Назад» с вложенного экрана / диалога — Link|navigate с replace.
 * 3) Смена вкладки/папки внутри раздела — replace (не засорять стек).
 * 4) Уход на /privacy|/chat-rules|/offer — state с legalReturnTo (+ reopen профиля).
 */

/** @param {string} source */
export function findBlindHistoryBack(source) {
  const code = String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const hits = []
  if (/\bnavigate\s*\(\s*-1\s*\)/.test(code)) hits.push('blind-navigate')
  if (/\bhistory\.back\s*\(/.test(code)) hits.push('blind-history-back')
  if (/\bhistory\.go\s*\(\s*-1\s*\)/.test(code)) hits.push('blind-history-go')
  return hits
}

/** Кнопки/ссылки «назад», которые обязаны быть replace. */
export const NAV_BACK_REPLACE_TARGETS = Object.freeze([
  { file: 'src/components/chat/MessengerLayout.jsx', re: /MessengerBack[\s\S]*?\breplace\b/, label: 'MessengerBack' },
  { file: 'src/components/chat/ChatOpenErrorAction.jsx', re: /to=\{backTo\}\s+replace/, label: 'К диалогам' },
  { file: 'src/pages/client/ClientPageNav.jsx', re: /navigate\(to, \{\s*replace:\s*true\s*\}\)/, label: 'ClientPageTitle' },
  { file: 'src/pages/staff/StaffChatThread.jsx', re: /to=\{back\}[\s\S]{0,60}?\breplace\b/, label: 'чат → карточка' },
  { file: 'src/pages/admin/SalesPnk.jsx', re: /to=\{backTo\}[\s\S]{0,60}?\breplace\b/, label: 'ПНК ←' },
  { file: 'src/pages/admin/AdminClients.jsx', re: /to="\/sales"[\s\S]{0,80}?\breplace\b/, label: 'продажи ← главная' },
  { file: 'src/pages/client/ClientSegments.jsx', re: /to=\{to\}[\s\S]{0,40}?\breplace\b/, label: 'сегменты /me' },
  { file: 'src/pages/staff/StaffMessenger.jsx', re: /folder: id \}\),\s*\{\s*replace:\s*true\s*\}/, label: 'папки сообщений клуба' },
  { file: 'src/pages/staff/AdminMessenger.jsx', re: /\},\s*\{\s*replace:\s*true\s*\}/, label: 'папки сообщений админа' },
])

/** Входы на legal — помнят, куда вернуться. */
export const NAV_LEGAL_RETURN_TARGETS = Object.freeze([
  { file: 'src/components/legal/PrivacyPolicyLink.jsx', needle: 'legalLinkNavState', label: 'политика' },
  { file: 'src/components/legal/ChatRulesLink.jsx', needle: 'legalLinkNavState', label: 'правила' },
  { file: 'src/components/legal/OfferLink.jsx', needle: 'legalLinkNavState', label: 'оферта' },
  { file: 'src/components/legal/LegalPageShell.jsx', needle: 'resolveLegalClose', label: 'крестик legal' },
  { file: 'src/components/legal/LegalCrossLink.jsx', needle: 'location.state', label: 'переходы между legal' },
  { file: 'src/components/AppHeader.jsx', needle: 'consumeReopenMyProfileState', label: 'профиль после legal' },
  { file: 'src/components/profile/ProfileMenuUser.jsx', needle: 'consumeReopenMyProfileState', label: 'профиль phone после legal' },
])
