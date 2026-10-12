/**
 * Ссылка из переписки перед открытием: настоящий сайт и признаки подделки. Без React.
 * Свои сообщения и ссылки на само приложение подтверждения не требуют.
 */
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * @returns {{ url: string, host: string, internal: boolean, warnings: string[] } | null} null — не http(s)
 */
export function chatLinkCheck(href, ownOrigin = '') {
  let u
  try {
    u = new URL(String(href ?? ''))
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  const warnings = []
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    warnings.push('В адресе буквы из другого алфавита — так подделывают известные сайты.')
  }
  if (IPV4_RE.test(host) || host.startsWith('[')) warnings.push('Вместо названия сайта — набор цифр.')
  if (u.username || u.password) warnings.push('В адресе есть «@» — на самом деле откроется сайт, указанный выше.')
  if (u.protocol === 'http:') warnings.push('Сайт без защищённого соединения (http).')
  return { url: u.href, host, internal: Boolean(ownOrigin) && u.origin === ownOrigin, warnings }
}

/** Спросить перед открытием: ссылка собеседника на чужой сайт. */
export function chatLinkNeedsConfirm(check, mine) {
  return Boolean(check) && !mine && !check.internal
}
