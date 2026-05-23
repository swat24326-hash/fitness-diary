import { todayLocalIso } from './dateRu'

function fmtLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** @returns {{ start: string, end: string }} ISO date yyyy-mm-dd; для «свой» без дат — пустые строки (без подстановки 7 дней). */
export function getDateRange(period, customStart, customEnd) {
  const today = new Date()
  const end = todayLocalIso()
  const fmt = fmtLocal

  if (period === 'custom') {
    const a = String(customStart ?? '').trim()
    const b = String(customEnd ?? '').trim()
    if (!a || !b) return { start: '', end: '' }
    if (a > b) return { start: '', end: '' }
    return { start: a, end: b }
  }

  if (period === 'today') {
    return { start: end, end }
  }

  if (period === 'yesterday') {
    const y = new Date(today)
    y.setDate(y.getDate() - 1)
    const s = fmt(y)
    return { start: s, end: s }
  }

  const d = new Date(today)
  if (period === '7d') {
    d.setDate(d.getDate() - 6)
    return { start: fmt(d), end }
  }
  if (period === '30d') {
    d.setDate(d.getDate() - 29)
    return { start: fmt(d), end }
  }

  d.setDate(d.getDate() - 6)
  return { start: fmt(d), end }
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
