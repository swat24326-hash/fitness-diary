/** Сегодня по локальному календарю устройства (не UTC), формат YYYY-MM-DD */
export function todayLocalIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Календарь зала / сети (Vercel = UTC; «сегодня» для клуба — Москва). */
export const CLUB_OPS_TIMEZONE = 'Europe/Moscow'

/**
 * Сегодня YYYY-MM-DD в заданной зоне (не TZ процесса Node/Vercel).
 * @param {string} [timeZone]
 * @param {Date} [now]
 */
export function todayInTimeZoneIso(timeZone = CLUB_OPS_TIMEZONE, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: String(timeZone || CLUB_OPS_TIMEZONE),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const d = parts.find((p) => p.type === 'day')?.value
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    /* fall through */
  }
  return todayLocalIso()
}

/**
 * Календарный день YYYY-MM-DD для момента (ISO) в зоне клуба (по умолчанию МСК).
 * Не путать с UTC-префиксом строки `created_at`.
 * @param {string | null | undefined} instantIso
 * @param {string} [timeZone]
 * @returns {string}
 */
export function calendarDayInTimeZoneIso(instantIso, timeZone = CLUB_OPS_TIMEZONE) {
  const raw = String(instantIso ?? '').trim()
  if (!raw) return ''
  const ms = Date.parse(raw)
  if (Number.isFinite(ms)) return todayInTimeZoneIso(timeZone, new Date(ms))
  const dayOnly = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(dayOnly) ? dayOnly : ''
}

/**
 * Начало календарного дня dayIso в timeZone → UTC ISO (для сравнения с created_at).
 * @param {string} dayIso YYYY-MM-DD
 * @param {string} [timeZone]
 */
export function calendarDayStartUtcIso(dayIso, timeZone = CLUB_OPS_TIMEZONE) {
  const day = String(dayIso ?? '').slice(0, 10)
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return `${day}T00:00:00.000Z`
  const yNum = Number(m[1])
  const moNum = Number(m[2])
  const dNum = Number(m[3])
  const tz = String(timeZone || CLUB_OPS_TIMEZONE)

  const wallParts = (ms) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
    return {
      y: Number(get('year')),
      mo: Number(get('month')),
      d: Number(get('day')),
      h: Number(get('hour')),
      mi: Number(get('minute')),
      s: Number(get('second')),
    }
  }

  const rank = (p) =>
    p.y * 1e10 + p.mo * 1e8 + p.d * 1e6 + p.h * 1e4 + p.mi * 100 + p.s
  const target = rank({ y: yNum, mo: moNum, d: dNum, h: 0, mi: 0, s: 0 })

  let lo = Date.UTC(yNum, moNum - 1, dNum) - 36 * 3600 * 1000
  let hi = Date.UTC(yNum, moNum - 1, dNum) + 36 * 3600 * 1000
  let found = lo
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const r = rank(wallParts(mid))
    if (r === target) {
      found = mid
      break
    }
    if (r < target) lo = mid + 1
    else hi = mid - 1
    found = mid
  }
  // Секунда 00:00:00 стены → целые UTC ms без дробей от бинарного поиска
  found = Math.floor(found / 1000) * 1000
  while (found > 0 && rank(wallParts(found - 1000)) >= target) found -= 1000
  while (rank(wallParts(found)) < target) found += 1000
  return new Date(found).toISOString()
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
 * Сдвиг YYYY-MM-DD по календарю (UTC-арифметика даты, без TZ устройства).
 * @param {string} dayIso
 * @param {number} days
 */
export function addCalendarDaysIso(dayIso, days) {
  const day = String(dayIso ?? '').slice(0, 10)
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  dt.setUTCDate(dt.getUTCDate() + (Number(days) || 0))
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/**
 * День клуба YYYY-MM-DD: пустое → ''; будущие → сегодня.
 * @param {unknown} raw
 * @param {string} [todayIso]
 */
export function normalizeClubOpsDayIso(raw, todayIso = todayInTimeZoneIso()) {
  const day = String(raw ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const today = String(todayIso ?? todayInTimeZoneIso()).slice(0, 10)
  if (day > today) return today
  return day
}

/**
 * Границы календарного дня клуба для сравнения с created_at (UTC ISO).
 * @param {string} dayIso
 * @param {string} [timeZone]
 * @returns {{ day: string, gte: string, lt: string }}
 */
export function clubOpsDayBoundsUtc(dayIso, timeZone = CLUB_OPS_TIMEZONE) {
  const today = todayInTimeZoneIso(timeZone)
  const day = normalizeClubOpsDayIso(dayIso, today) || today
  const gte = calendarDayStartUtcIso(day, timeZone)
  const next = addCalendarDaysIso(day, 1)
  const lt = calendarDayStartUtcIso(next, timeZone)
  return { day, gte, lt }
}

/**
 * Сколько календарных дней от from до to включительно (to >= from).
 * @param {string} fromIso
 * @param {string} toIso
 */
export function inclusiveCalendarDaysBetween(fromIso, toIso) {
  const a = String(fromIso ?? '').slice(0, 10)
  const b = String(toIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || a > b) return 0
  const t0 = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))
  const t1 = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)))
  return Math.floor((t1 - t0) / 86400000) + 1
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

