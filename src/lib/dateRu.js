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

