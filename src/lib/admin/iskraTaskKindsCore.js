/**
 * Реестр типов заданий Планёрки — как в task-менеджере, не чат.
 */

/** @typedef {'reactivate_clients' | 'daily_report' | 'plan_push' | 'training_hygiene' | 'custom'} IskraTaskKind */
/** @typedef {'normal' | 'high'} IskraTaskPriority */

export const ISKRA_TASK_KINDS = /** @type {const} */ ([
  'reactivate_clients',
  'daily_report',
  'plan_push',
  'training_hygiene',
  'custom',
])

export const ISKRA_TASK_PRIORITIES = /** @type {const} */ (['normal', 'high'])

/** @type {Record<string, { label: string, deepLink: string, defaultDays?: number }>} */
export const ISKRA_TASK_KIND_META = {
  reactivate_clients: {
    label: 'Реактивация клиентов',
    deepLink: '/trainer/clients?filter=stale',
    defaultDays: 3,
  },
  daily_report: {
    label: 'Дневной отчёт',
    deepLink: '/sales?tab=report',
    defaultDays: 1,
  },
  plan_push: {
    label: 'План и продажи',
    deepLink: '/trainer',
    defaultDays: 3,
  },
  training_hygiene: {
    label: 'Тренировки и журнал',
    deepLink: '/trainer/clients',
    defaultDays: 2,
  },
  custom: {
    label: 'Своё задание',
    deepLink: '/trainer',
    defaultDays: 3,
  },
}

/** @type {Record<string, IskraTaskKind>} */
const INSIGHT_TO_TASK_KIND = {
  inactive_clients: 'reactivate_clients',
  report_today: 'daily_report',
  plan_behind_calendar: 'plan_push',
  direction_lag: 'plan_push',
  forecast_shortfall: 'plan_push',
  weak_nk_share: 'plan_push',
  low_pnk: 'plan_push',
  payroll_pressure: 'plan_push',
  fitcity_gap: 'training_hygiene',
}

/**
 * @param {string} insightKey
 * @returns {IskraTaskKind}
 */
export function resolveTaskKindFromInsight(insightKey) {
  const key = String(insightKey ?? '').trim()
  return INSIGHT_TO_TASK_KIND[key] ?? 'custom'
}

/**
 * @param {string} taskKind
 */
export function resolveDeepLinkForTaskKind(taskKind) {
  const k = String(taskKind ?? '').trim()
  return ISKRA_TASK_KIND_META[k]?.deepLink ?? ISKRA_TASK_KIND_META.custom.deepLink
}

/**
 * @param {string} taskKind
 */
export function taskKindLabel(taskKind) {
  const k = String(taskKind ?? '').trim()
  return ISKRA_TASK_KIND_META[k]?.label ?? ISKRA_TASK_KIND_META.custom.label
}

/**
 * @param {'tomorrow' | '3days' | 'week' | 'none' | string} preset
 * @param {Date} [now]
 */
export function resolveDueAtFromPreset(preset, now = new Date()) {
  const p = String(preset ?? '').trim().toLowerCase()
  if (!p || p === 'none') return null

  const base = new Date(now)
  base.setHours(23, 59, 59, 999)

  if (p === 'tomorrow') {
    base.setDate(base.getDate() + 1)
    return base.toISOString()
  }
  if (p === '3days' || p === '3_days') {
    base.setDate(base.getDate() + 3)
    return base.toISOString()
  }
  if (p === 'week' || p === '7days') {
    base.setDate(base.getDate() + 7)
    return base.toISOString()
  }

  const parsed = Date.parse(preset)
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return null
}

/**
 * @param {string | null | undefined} dueAtIso
 * @param {Date} [now]
 */
export function isDispatchOverdue(dueAtIso, now = new Date()) {
  if (!dueAtIso) return false
  const t = Date.parse(String(dueAtIso))
  if (!Number.isFinite(t)) return false
  return t < now.getTime()
}

/**
 * @param {string | null | undefined} dueAtIso
 */
export function formatDispatchDueLabel(dueAtIso) {
  if (!dueAtIso) return ''
  const d = new Date(dueAtIso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * @param {string} insightKey
 */
export function suggestDefaultDuePreset(insightKey) {
  const kind = resolveTaskKindFromInsight(insightKey)
  const days = ISKRA_TASK_KIND_META[kind]?.defaultDays ?? 3
  if (days <= 1) return 'tomorrow'
  if (days <= 3) return '3days'
  return 'week'
}

/**
 * @param {string} insightKey
 */
export function suggestPriorityFromInsight(insightKey) {
  const key = String(insightKey ?? '').trim()
  if (key === 'inactive_clients' || key === 'plan_behind_calendar' || key === 'report_today') {
    return /** @type {IskraTaskPriority} */ ('high')
  }
  return /** @type {IskraTaskPriority} */ ('normal')
}
