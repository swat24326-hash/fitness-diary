/**
 * KPI и карточки сегмента «Тренеры» (планшеты, не отчёт менеджера).
 */

import { formatRub } from './salesReportCore.js'

/**
 * @param {object | null | undefined} contour
 * @param {string | null | undefined} trainerId
 */
export function buildTrainerPanelKpi(contour, trainerId = null) {
  if (!contour || typeof contour !== 'object') return null

  const sid = String(trainerId ?? '').trim()
  const row = sid
    ? (contour.trainers ?? []).find((t) => t.trainer_id === sid) ?? contour.selected_trainer
    : null
  const roll = contour.club_roll_up ?? {}

  const completed = Number(row?.completed_trainings ?? roll.completed_trainings) || 0
  const salary = Number(row?.personal_salary_month ?? roll.personal_salary_sum) || 0
  const active = Number(row?.current_active_holders ?? 0)
  const inactive = Number(row?.inactive_clients_holders ?? roll.inactive_clients_holders) || 0
  const noType = Number(row?.no_type_trainings_ignored ?? roll.no_type_trainings_ignored) || 0
  const clientsTotal = Number(row?.active_clients_total ?? 0)
  const trainersCount = Number(roll.trainers_count) || (contour.trainers ?? []).length

  const label = row?.trainer_name
    ? String(row.trainer_name)
    : sid
      ? 'Тренер'
      : `Клуб · ${trainersCount} трен.`

  const fillPct = sid && trainersCount > 0
    ? Math.min(100, Math.round((completed / Math.max(1, (roll.completed_trainings || 1) / trainersCount)) * 100))
    : 100

  return {
    scope: sid ? 'trainer' : 'club',
    trainerId: sid || null,
    label,
    completedTrainings: completed,
    personalSalary: salary,
    personalSalaryLabel: formatRub(salary),
    activeHolders: active,
    inactiveHolders: inactive,
    noTypeTrainings: noType,
    clientsTotal,
    trainersCount,
    activityFillPercent: fillPct,
    isolatedNote: 'Данные планшетов — не смешивать с продажами из отчёта менеджера.',
  }
}

/**
 * @param {object | null | undefined} contour
 * @param {{ trainerId?: string | null, limit?: number }} [opts]
 */
export function buildTrainerInsightCards(contour, opts = {}) {
  if (!contour || typeof contour !== 'object') return []

  const limit = Math.max(1, Number(opts.limit) || 3)
  const sid = String(opts.trainerId ?? '').trim()
  const row = sid
    ? (contour.trainers ?? []).find((t) => t.trainer_id === sid) ?? contour.selected_trainer
    : null
  const roll = contour.club_roll_up ?? {}
  const trainers = Array.isArray(contour.trainers) ? contour.trainers : []

  /** @type {Array<Record<string, unknown>>} */
  const cards = []

  const inactive = Number(row?.inactive_clients_holders ?? roll.inactive_clients_holders) || 0
  if (inactive >= 2) {
    cards.push({
      id: 'tr_inactive',
      headline: sid ? `${inactive} неактивных клиентов` : `${inactive} неактивных в клубе`,
      action: 'Связаться и предложить продление абонемента',
      evidence: 'Планшеты: нет действующего абонемента на конец периода',
      doHandlerId: sid ? 'trainer_clients' : 'trainer_inactive',
      doMessage: sid
        ? 'Сколько активных и неактивных клиентов у этого тренера?'
        : 'Кто неактивные клиенты и что с ними делать?',
      doLabel: 'Спросить',
      tone: 'warn',
      priority: 1,
    })
  }

  const noType = Number(row?.no_type_trainings_ignored ?? roll.no_type_trainings_ignored) || 0
  if (noType >= 1) {
    cards.push({
      id: 'tr_no_type',
      headline: `${noType} трен. без типа карты`,
      action: 'Проверить завершение тренировок на планшете',
      evidence: 'Такие тренировки не учитываются в личной ЗП',
      doHandlerId: 'trainer_no_type',
      doMessage: 'Сколько тренировок без типа карты у тренера за месяц?',
      doLabel: 'Спросить',
      tone: 'accent',
      priority: 2,
    })
  }

  if (!sid && trainers.length >= 2) {
    const sorted = [...trainers].sort(
      (a, b) => (Number(b.completed_trainings) || 0) - (Number(a.completed_trainings) || 0),
    )
    const top = sorted[0]
    const bottom = sorted[sorted.length - 1]
    if (top && bottom && top.trainer_id !== bottom.trainer_id) {
      const gap = (Number(top.completed_trainings) || 0) - (Number(bottom.completed_trainings) || 0)
      if (gap >= 5) {
        cards.push({
          id: 'tr_rank_gap',
          headline: `Разрыв: ${gap} тренировок`,
          action: `Сверить нагрузку ${bottom.trainer_name} и ${top.trainer_name}`,
          evidence: 'Завершённые тренировки на планшетах за месяц',
          doHandlerId: 'trainer_rank',
          doMessage: 'Кто из тренеров лидер по завершённым тренировкам за месяц?',
          doLabel: 'Рейтинг',
          tone: 'neutral',
          priority: 3,
        })
      }
    }
  }

  if (sid && row) {
    const salary = Number(row.personal_salary_month) || 0
    const completed = Number(row.completed_trainings) || 0
    if (completed >= 8 && salary > 0) {
      cards.push({
        id: 'tr_salary_ok',
        headline: `ЗП планшета ${formatRub(salary)}`,
        action: 'Сверить с начислением в отчёте менеджера отдельно',
        evidence: `${completed} завершённых тренировок`,
        doHandlerId: 'trainer_salary',
        doMessage: 'Какая личная ЗП тренера по планшетам за месяц?',
        doLabel: 'ЗП',
        tone: 'ok',
        priority: 4,
      })
    }
  }

  return cards
    .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99))
    .slice(0, limit)
}
