/**
 * Сегменты панели ИСКРЫ: продажи (отчёт менеджера) и тренеры (планшеты).
 * Чистые функции — scripts/verify-iskra-panel-segment.mjs
 */

/** @typedef {'sales'|'trainer'} IskraPanelSegment */

export const ISKRA_PANEL_SEGMENTS = /** @type {const} */ (['sales', 'trainer'])

/** Алерты контура продаж */
export const ISKRA_SALES_ALERT_IDS = new Set([
  'plan_critical',
  'no_reports',
  'low_coverage',
  'forecast_miss',
])

/** Алерты контура тренеров (планшеты) */
export const ISKRA_TRAINER_ALERT_IDS = new Set([
  'inactive_spike',
  'trainer_no_type',
  'trainer_inactive_focus',
  'trainer_low_trainings',
])

/**
 * @param {string | null | undefined} selectedTrainerId
 * @returns {IskraPanelSegment}
 */
export function resolveDefaultPanelSegment(selectedTrainerId) {
  return String(selectedTrainerId ?? '').trim() ? 'trainer' : 'sales'
}

/**
 * @param {Array<{ id: string }>} alerts
 * @param {IskraPanelSegment} segment
 */
export function filterProactiveAlertsForSegment(alerts, segment) {
  const list = Array.isArray(alerts) ? alerts : []
  const ids = segment === 'trainer' ? ISKRA_TRAINER_ALERT_IDS : ISKRA_SALES_ALERT_IDS
  return list.filter((a) => ids.has(String(a?.id ?? '')))
}

/**
 * Дополнительные алерты из trainer_contour (планшеты).
 * @param {object | null | undefined} contour
 * @param {string | null | undefined} trainerId
 */
export function buildTrainerContourAlerts(contour, trainerId = null) {
  if (!contour || typeof contour !== 'object') return []

  const sid = String(trainerId ?? '').trim()
  const row = sid
    ? (contour.trainers ?? []).find((t) => t.trainer_id === sid) ?? contour.selected_trainer
    : null
  const roll = contour.club_roll_up ?? {}
  const inactive = Number(row?.inactive_clients_holders ?? roll.inactive_clients_holders) || 0
  const noType = Number(row?.no_type_trainings_ignored ?? roll.no_type_trainings_ignored) || 0
  const completed = Number(row?.completed_trainings ?? roll.completed_trainings) || 0

  /** @type {Array<{ id: string, severity: string, title: string, message: string, handlerId?: string, ctaMessage?: string }>} */
  const out = []

  if (inactive >= 3) {
    const who = row?.trainer_name ? ` у ${row.trainer_name}` : ''
    out.push({
      id: sid ? 'trainer_inactive_focus' : 'inactive_spike',
      severity: 'accent',
      title: `Неактивных${who}: ${inactive}`,
      message: 'Клиенты без абонемента на конец периода — риск оттока.',
      handlerId: sid ? 'trainer_clients' : 'trainer_inactive',
      ctaMessage: sid
        ? 'Сколько активных и неактивных клиентов у этого тренера?'
        : 'Кто неактивные клиенты и что с ними делать?',
    })
  }

  if (noType >= 2) {
    out.push({
      id: 'trainer_no_type',
      severity: 'warn',
      title: `Без типа карты: ${noType}`,
      message: 'Тренировки без типа абонемента не попадают в ЗП — проверьте планшеты.',
      handlerId: 'trainer_no_type',
      ctaMessage: 'Сколько тренировок без типа карты у тренера за месяц?',
    })
  }

  if (sid && completed === 0) {
    out.push({
      id: 'trainer_low_trainings',
      severity: 'warn',
      title: 'Нет завершённых тренировок',
      message: 'За месяц нет completed на планшете — сверьте с отчётом менеджера.',
      handlerId: 'trainer_trainings',
      ctaMessage: 'Сколько завершённых тренировок у тренера за месяц?',
    })
  }

  return out.slice(0, 3)
}

/**
 * @param {Array<{ id: string }>} baseAlerts
 * @param {object | null | undefined} contour
 * @param {IskraPanelSegment} segment
 * @param {string | null | undefined} trainerId
 */
export function resolveSegmentAlerts(baseAlerts, contour, segment, trainerId = null) {
  const filtered = filterProactiveAlertsForSegment(baseAlerts, segment)
  if (segment !== 'trainer') return filtered

  const extra = buildTrainerContourAlerts(contour, trainerId)
  const seen = new Set(filtered.map((a) => a.id))
  const merged = [...filtered]
  for (const a of extra) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    merged.push(a)
  }
  return merged.slice(0, 4)
}
