/** Сегодня по локальному календарю устройства (не UTC), формат YYYY-MM-DD */
export function todayLocalIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** @param {string} iso yyyy-mm-dd */
export function isIsoDateAfterToday(iso) {
  const d = String(iso ?? '').slice(0, 10)
  if (!d) return false
  return d > todayLocalIso()
}

/** Не позже сегодня (для тренера и проверок при сохранении). */
export function clampIsoDateToToday(iso) {
  const d = String(iso ?? '').slice(0, 10)
  const today = todayLocalIso()
  if (!d || d > today) return today
  return d
}

/** @param {string} iso YYYY-MM-DD @param {number} days */
export function addDaysToIso(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Календарные месяцы (не «+30 дней»): 24.07 → 24.08.
 * Если дня нет в целевом месяце (31.01 → февраль) — последний день месяца.
 * @param {string} iso YYYY-MM-DD
 * @param {number} months
 */
export function addMonthsToIso(iso, months) {
  const raw = String(iso ?? '').slice(0, 10)
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return raw
  const delta = Number(months)
  if (!Number.isFinite(delta)) return raw
  const targetMonthIndex = m - 1 + Math.trunc(delta)
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const month0 = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(targetYear, month0 + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  const mm = String(month0 + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${targetYear}-${mm}-${dd}`
}

/**
 * Дата окончания абонемента по умолчанию: +1 календарный месяц от старта.
 * @param {string} startIso YYYY-MM-DD
 */
export function defaultMembershipEndIso(startIso) {
  const start = String(startIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return ''
  return addMonthsToIso(start, 1)
}

export function formatDateRu(isoLike) {
  if (!isoLike) return '—'
  const s = String(isoLike)
  const parts = s.slice(0, 10).split('-')
  if (parts.length !== 3) return s
  const [y, m, d] = parts
  if (!y || !m || !d) return s
  return `${d}.${m}.${y}`
}

/**
 * Маска ввода дд.мм.гггг пока печатают цифры (01031999 → 01.03.1999).
 * @param {unknown} raw
 * @returns {string}
 */
export function maskRuDateDigitsInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

/**
 * Гибкий разбор даты для админ/менеджерских полей: ISO, дд.мм.гггг или 8 цифр.
 * @param {unknown} raw
 * @param {{ minYear?: number, maxYear?: number }} [opts]
 * @returns {string} YYYY-MM-DD или ''
 */
export function parseFlexibleDateToIso(raw, opts = {}) {
  const s = String(raw ?? '').trim()
  if (!s) return ''

  const minYear = Number.isFinite(Number(opts?.minYear)) ? Number(opts.minYear) : 1920
  const maxYear = Number.isFinite(Number(opts?.maxYear)) ? Number(opts.maxYear) : 2100

  const tryYmd = (y, m, d) => {
    const yy = Number(y)
    const mm = Number(m)
    const dd = Number(d)
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return ''
    if (yy < minYear || yy > maxYear || mm < 1 || mm > 12 || dd < 1 || dd > 31) return ''
    const dt = new Date(yy, mm - 1, dd)
    if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return ''
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return tryYmd(s.slice(0, 4), s.slice(5, 7), s.slice(8, 10))
  }

  const ru = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (ru) return tryYmd(ru[3], ru[2], ru[1])

  const digits = s.replace(/\D/g, '')
  if (digits.length === 8) {
    return tryYmd(digits.slice(4, 8), digits.slice(2, 4), digits.slice(0, 2))
  }

  return ''
}

/**
 * Годы для даты рождения (не абонементный горизонт 1990+).
 * @returns {{ minYear: number, maxYear: number }}
 */
export function birthDateYearBounds() {
  const maxYear = Number(todayLocalIso().slice(0, 4)) || new Date().getFullYear()
  return { minYear: 1920, maxYear }
}

/**
 * Дата и время для журналов (локальные часы устройства).
 * ISO с Z / offset — не резать как UTC-строку: иначе Москва видит −3 ч.
 * @param {string | null | undefined} isoLike
 * @param {{ timeZone?: string }} [opts] — для verify: например `'Europe/Moscow'`
 */
export function formatDateTimeRu(isoLike, opts = {}) {
  if (!isoLike) return '—'
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return '—'

  const timeZone = opts.timeZone ? String(opts.timeZone) : undefined
  try {
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
    const day = get('day')
    const month = get('month')
    const year = get('year')
    const hour = get('hour')
    const minute = get('minute')
    if (!day || !month || !year) return '—'
    return `${day}.${month}.${year}, ${hour}:${minute}`
  } catch {
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hour = String(d.getHours()).padStart(2, '0')
    const minute = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year}, ${hour}:${minute}`
  }
}

/**
 * Открыть нативный календарь у input[type=date|month].
 * На планшетах/Chromium прозрачный overlay часто не открывает picker — нужен showPicker().
 * @param {HTMLInputElement | null | undefined} el
 */
export function openNativeDatePicker(el) {
  if (!el || el.disabled) return
  if (typeof el.showPicker === 'function') {
    try {
      el.showPicker()
      return
    } catch {
      /* NotAllowedError / старый браузер — fallback ниже */
    }
  }
  el.focus()
  el.click()
}

