/**
 * Нормализация ФИО клиента для карточки.
 * Допустимо: «Фамилия», «Фамилия Имя», «Фамилия Имя Отчество», «Фамилия И.О.»
 */

function capWord(w) {
  const s = String(w ?? '')
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Одна буква / «Р.» / «РА» (все заглавные) → токен инициала. */
export function isClientNameInitialsPart(token) {
  const raw = String(token ?? '').trim()
  if (!raw) return false
  if (/^[A-Za-zА-Яа-яЁё]\.$/u.test(raw)) return true
  if (/^[A-Za-zА-Яа-яЁё]\.([A-Za-zА-Яа-яЁё]\.)+$/u.test(raw)) return true
  const letters = raw.replace(/\./g, '')
  if (letters.length === 1 && /^[A-Za-zА-Яа-яЁё]$/u.test(letters)) return true
  if (letters.length >= 2 && letters.length <= 3 && /^[A-Za-zА-Яа-яЁё]+$/u.test(letters) && letters === letters.toUpperCase()) {
    return true
  }
  return false
}

/** @param {string} token */
function formatInitialsPart(token) {
  const raw = String(token ?? '').trim()
  if (/^[A-Za-zА-Яа-яЁё]\.([A-Za-zА-Яа-яЁё]\.)*$/u.test(raw)) {
    return raw
      .split('.')
      .filter(Boolean)
      .map((ch) => `${ch.toUpperCase()}.`)
      .join('')
  }
  const letters = raw.replace(/\./g, '')
  if (letters.length === 1) return `${letters.toUpperCase()}.`
  return letters
    .slice(0, 3)
    .split('')
    .map((ch) => `${ch.toUpperCase()}.`)
    .join('')
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function formatClientName(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const parts = s.split(' ').filter(Boolean)
  const surname = capWord(parts[0])
  const rest = parts.slice(1)
  if (!rest.length) return surname

  /** @type {string[]} */
  const out = []
  /** @type {string[]} */
  let pendingInitials = []

  const flushInitials = () => {
    if (!pendingInitials.length) return
    out.push(pendingInitials.join(''))
    pendingInitials = []
  }

  for (const token of rest) {
    if (isClientNameInitialsPart(token)) {
      pendingInitials.push(formatInitialsPart(token))
      continue
    }
    flushInitials()
    out.push(capWord(token))
  }
  flushInitials()

  return [surname, ...out].join(' ').trim()
}
