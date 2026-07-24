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

export function formatDateTimeRu(isoLike) {
  if (!isoLike) return '—'
  const s = String(isoLike)
  // Expected ISO: 2026-04-28T20:11:00.000Z
  const date = formatDateRu(s)
  const timeMatch = s.match(/T(\d{2}):(\d{2})/)
  if (!timeMatch) return date
  const hh = timeMatch[1]
  const mm = timeMatch[2]
  return `${hh}:${mm} ${date}`
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

