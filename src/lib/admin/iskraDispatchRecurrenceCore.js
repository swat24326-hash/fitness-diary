/** @typedef {'day' | 'week' | 'month'} DispatchRecurrenceUnit */

export const DISPATCH_RECURRENCE_CUSTOM_DAYS_MIN = 2
export const DISPATCH_RECURRENCE_CUSTOM_DAYS_MAX = 90

/** @type {Array<{ id: string, label: string, interval: number, unit: DispatchRecurrenceUnit }>} */
export const DISPATCH_RECURRENCE_PRESETS = [
  { id: '', label: 'Разовое', interval: 0, unit: 'day' },
  { id: 'daily', label: 'Каждый день', interval: 1, unit: 'day' },
  { id: 'weekly', label: 'Каждую неделю', interval: 1, unit: 'week' },
  { id: 'every_3_weeks', label: 'Каждые 3 недели', interval: 3, unit: 'week' },
  { id: 'monthly', label: 'Каждый месяц', interval: 1, unit: 'month' },
  { id: 'custom_days', label: 'Свой интервал', interval: 0, unit: 'day' },
]
/**
 * @param {number} n
 */
export function formatRecurrenceDaysRu(n) {
  const num = Math.trunc(Number(n))
  if (!Number.isFinite(num) || num <= 0) return ''
  const mod10 = num % 10
  const mod100 = num % 100
  if (mod10 === 1 && mod100 !== 11) return `${num} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${num} дня`
  return `${num} дней`
}

/**
 * @param {number | string} days
 */
export function isValidCustomRecurrenceDays(days) {
  const n = Math.trunc(Number(days))
  return Number.isFinite(n) && n >= DISPATCH_RECURRENCE_CUSTOM_DAYS_MIN && n <= DISPATCH_RECURRENCE_CUSTOM_DAYS_MAX
}

/**
 * @param {string} presetId
 */
export function recurrenceRuleFromPreset(presetId) {
  const id = String(presetId ?? '').trim()
  if (id === 'custom_days') {
    return { enabled: false, interval: null, unit: null, preset_id: 'custom_days' }
  }
  const hit = DISPATCH_RECURRENCE_PRESETS.find((p) => p.id === id)
  if (!hit?.id) {
    return { enabled: false, interval: null, unit: null, preset_id: '' }
  }
  return {
    enabled: true,
    interval: hit.interval,
    unit: hit.unit,
    preset_id: hit.id,
  }
}

/**
 * @param {{ recurrence_preset?: string, recurrence_days?: number, recurrence?: { interval?: number, unit?: string } }} raw
 */
export function normalizeRecurrenceInput(raw = {}) {
  const preset = String(raw?.recurrence_preset ?? '').trim()
  if (preset === 'custom_days') {
    const n = Math.trunc(Number(raw?.recurrence_days ?? raw?.recurrence?.interval))
    if (isValidCustomRecurrenceDays(n)) {
      return {
        enabled: true,
        interval: n,
        unit: /** @type {DispatchRecurrenceUnit} */ ('day'),
        preset_id: 'custom_days',
      }
    }
    return { enabled: false, interval: null, unit: null, preset_id: 'custom_days' }
  }
  if (preset) return recurrenceRuleFromPreset(preset)

  const interval = Number(raw?.recurrence?.interval)
  const unit = String(raw?.recurrence?.unit ?? '').trim()
  if (Number.isFinite(interval) && interval > 0 && ['day', 'week', 'month'].includes(unit)) {
    const presetId =
      interval === 1 && unit === 'day'
        ? 'daily'
        : interval === 1 && unit === 'week'
          ? 'weekly'
          : interval === 3 && unit === 'week'
            ? 'every_3_weeks'
            : interval === 1 && unit === 'month'
              ? 'monthly'
              : ''
    return {
      enabled: true,
      interval: Math.trunc(interval),
      unit: /** @type {DispatchRecurrenceUnit} */ (unit),
      preset_id: presetId,
    }
  }

  return { enabled: false, interval: null, unit: null, preset_id: '' }
}

/**
 * @param {number | null | undefined} interval
 * @param {string | null | undefined} unit
 */
export function formatRecurrenceLabel(interval, unit) {
  const n = Number(interval)
  const u = String(unit ?? '').trim()
  if (!Number.isFinite(n) || n <= 0 || !u) return ''

  if (u === 'day' && n === 1) return 'Каждый день'
  if (u === 'week' && n === 1) return 'Каждую неделю'
  if (u === 'week' && n === 3) return 'Каждые 3 недели'
  if (u === 'month' && n === 1) return 'Каждый месяц'
  if (u === 'day' && n > 1) return `Каждые ${formatRecurrenceDaysRu(n)}`

  const unitRu = u === 'day' ? 'дн.' : u === 'week' ? 'нед.' : 'мес.'
  return `Каждые ${n} ${unitRu}`
}

/**
 * Следующий дедлайн цикла от предыдущего due_at (или от now).
 * @param {string | null | undefined} previousDueAtIso
 * @param {{ interval: number, unit: DispatchRecurrenceUnit }} rule
 * @param {Date} [now]
 */
export function computeNextDueAtFromRecurrence(previousDueAtIso, rule, now = new Date()) {
  const interval = Math.trunc(Number(rule?.interval))
  const unit = String(rule?.unit ?? '').trim()
  if (!Number.isFinite(interval) || interval <= 0) return null
  if (!['day', 'week', 'month'].includes(unit)) return null

  let anchor = previousDueAtIso ? new Date(previousDueAtIso) : new Date(now)
  if (Number.isNaN(anchor.getTime())) anchor = new Date(now)

  const next = new Date(anchor)
  const step = () => {
    if (unit === 'day') next.setDate(next.getDate() + interval)
    else if (unit === 'week') next.setDate(next.getDate() + interval * 7)
    else if (unit === 'month') next.setMonth(next.getMonth() + interval)
    next.setHours(23, 59, 59, 999)
  }

  step()
  const floor = now.getTime()
  let guard = 0
  while (next.getTime() < floor && guard < 24) {
    step()
    guard++
  }

  return next.toISOString()
}

/**
 * @param {object} row завершённое задание
 * @param {string} nextDueAt
 * @param {string} nowIso
 */
export function buildRecurringDispatchSpawnRow(row, nextDueAt, nowIso) {
  return {
    club_id: row.club_id,
    recipient_user_id: row.recipient_user_id,
    kind: row.kind ?? 'task',
    status: 'pending',
    title: row.title,
    body: row.body,
    source: row.source,
    source_channel: row.source_channel,
    context_json: row.context_json ?? {},
    insight_key: row.insight_key ?? '',
    task_kind: row.task_kind ?? 'custom',
    priority: row.priority ?? 'normal',
    due_at: nextDueAt,
    deep_link: row.deep_link ?? '',
    period_year: row.period_year ?? null,
    period_month: row.period_month ?? null,
    series_id: row.series_id,
    recurrence_interval: row.recurrence_interval,
    recurrence_unit: row.recurrence_unit,
    updated_at: nowIso,
  }
}

/**
 * @param {object} row
 */
export function hasActiveRecurringSeries(row) {
  const interval = Number(row?.recurrence_interval)
  const unit = String(row?.recurrence_unit ?? '').trim()
  return Number.isFinite(interval) && interval > 0 && !!unit && !!row?.series_id
}

/**
 * @param {object} raw
 * @returns {{ ok: true, dispatch_id?: string, series_id?: string, club_id: string } | { ok: false, error: string }}
 */
export function normalizeStopRecurrencePayload(raw) {
  const dispatchId = String(raw?.dispatch_id ?? raw?.id ?? '').trim()
  const seriesId = String(raw?.series_id ?? '').trim()
  const clubId = String(raw?.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'Укажите club_id' }
  if (!dispatchId && !seriesId) return { ok: false, error: 'Укажите dispatch_id или series_id' }
  return {
    ok: true,
    dispatch_id: dispatchId || undefined,
    series_id: seriesId || undefined,
    club_id: clubId,
  }
}
