import { todayLocalIso } from '../dateRu.js'

/** @typedef {'tomorrow' | '3days' | 'none' | 'date'} DispatchDueMode */

export const DISPATCH_DUE_MODES = /** @type {const} */ (['tomorrow', '3days', 'none', 'date'])

/** @type {Array<{ id: DispatchDueMode, label: string }>} */
export const DISPATCH_DUE_MODE_OPTIONS = [
  { id: 'tomorrow', label: 'Завтра' },
  { id: '3days', label: '3 дня' },
  { id: 'none', label: 'Без срока' },
  { id: 'date', label: 'Дата' },
]

/**
 * Конец локального дня по YYYY-MM-DD (дедлайн «до конца дня»).
 * @param {string} isoDate
 */
export function dueAtEndOfLocalDay(isoDate) {
  const parts = String(isoDate ?? '').slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || !parts[0]) return null
  const [y, m, d] = parts
  const dt = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

/**
 * @param {DispatchDueMode | string} mode
 * @param {{ dueDate?: string, now?: Date }} [opts]
 */
export function resolveDueAtFromMode(mode, opts = {}) {
  const m = String(mode ?? '').trim().toLowerCase()
  const now = opts.now ?? new Date()

  if (!m || m === 'none') return null

  if (m === 'date') {
    const iso = String(opts.dueDate ?? '').slice(0, 10)
    if (!iso || iso < todayLocalIso()) return null
    return dueAtEndOfLocalDay(iso)
  }

  const base = new Date(now)
  base.setHours(23, 59, 59, 999)

  if (m === 'tomorrow') {
    base.setDate(base.getDate() + 1)
    return base.toISOString()
  }
  if (m === '3days' || m === '3_days') {
    base.setDate(base.getDate() + 3)
    return base.toISOString()
  }

  return null
}

/**
 * Разбор due_preset / due_date из API и форм.
 * @param {{ due_preset?: string, due_at?: string, due_date?: string, now?: Date }} raw
 */
export function resolveDispatchDueAt(raw = {}) {
  const explicit = raw?.due_at ? String(raw.due_at).trim() : ''
  if (explicit) {
    const parsed = Date.parse(explicit)
    if (Number.isFinite(parsed)) {
      return { due_at: new Date(parsed).toISOString(), due_mode: 'date', due_date: '' }
    }
  }

  const preset = String(raw?.due_preset ?? '').trim().toLowerCase()
  if (preset.startsWith('date:')) {
    const iso = preset.slice(5, 15)
    const dueAt = resolveDueAtFromMode('date', { dueDate: iso, now: raw.now })
    return { due_at: dueAt, due_mode: /** @type {DispatchDueMode} */ ('date'), due_date: iso }
  }

  if (preset === 'date') {
    const iso = String(raw?.due_date ?? '').slice(0, 10)
    const dueAt = resolveDueAtFromMode('date', { dueDate: iso, now: raw.now })
    return { due_at: dueAt, due_mode: 'date', due_date: iso }
  }

  if (DISPATCH_DUE_MODES.includes(preset)) {
    const dueAt = resolveDueAtFromMode(preset, { now: raw.now })
    return { due_at: dueAt, due_mode: preset, due_date: '' }
  }

  // Обратная совместимость: week → 3 дня в UI не показываем, но старые пресеты читаем
  if (preset === 'week' || preset === '7days') {
    const dueAt = resolveDueAtFromMode('3days', { now: raw.now })
    return { due_at: dueAt, due_mode: '3days', due_date: '' }
  }

  return { due_at: null, due_mode: 'none', due_date: '' }
}

/**
 * @param {DispatchDueMode | string} mode
 */
export function dispatchDueModeLabel(mode) {
  const hit = DISPATCH_DUE_MODE_OPTIONS.find((o) => o.id === mode)
  return hit?.label ?? 'Без срока'
}

/**
 * Минимальная дата для календаря — сегодня (локально).
 */
export function dispatchDueDateMinIso() {
  return todayLocalIso()
}

/**
 * @param {string} isoDate YYYY-MM-DD
 */
export function isValidFutureDueDate(isoDate) {
  const d = String(isoDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  return d >= todayLocalIso()
}
