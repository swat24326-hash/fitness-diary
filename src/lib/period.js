import { todayLocalIso } from './dateRu'

function fmtLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Кнопки периода в статистике (админ / тренер). */
export const PERIOD_PRESETS = [
  { id: 'month', label: 'Календарный месяц' },
  { id: 'today', label: 'Сегодня' },
  { id: 'custom', label: 'Свой' },
]

/** @returns {{ start: string, end: string }} ISO date yyyy-mm-dd; для «свой» без дат — пустые строки. */
export function getDateRange(period, customStart, customEnd) {
  const today = new Date()
  const todayIso = todayLocalIso()
  const fmt = fmtLocal

  if (period === 'custom') {
    const a = String(customStart ?? '').trim()
    const b = String(customEnd ?? '').trim()
    if (!a || !b) return { start: '', end: '' }
    if (a > b) return { start: '', end: '' }
    return { start: a, end: b }
  }

  if (period === 'today') {
    return { start: todayIso, end: todayIso }
  }

  if (period === 'month') {
    const start = fmt(new Date(today.getFullYear(), today.getMonth(), 1))
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const end = fmt(lastDay)
    return { start, end }
  }

  return { start: '', end: '' }
}

export function isDateInRange(dateStr, start, end) {
  if (!dateStr || !start || !end) return false
  return dateStr >= start && dateStr <= end
}

/** ISO yyyy-mm-dd -> dd.mm.yyyy (для вывода в UI) */
export function formatIsoRu(iso) {
  const s = String(iso ?? '')
  const p = s.split('-')
  if (p.length !== 3) return s
  const [y, m, d] = p
  if (!y || !m || !d) return s
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}
