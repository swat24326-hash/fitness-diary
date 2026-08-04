/**
 * Тренерский контур для ЭВС «ИСКРА» — агрегаты без PII (без имён клиентов).
 * Изолирован от контура продаж (матрица менеджера).
 */

import { filterHallOperationalClients } from './holdingClientsCore.js'
import { aggregateClubClientPeriod } from './clubClientPeriodAgg.js'
import {
  MEMBERSHIP_TYPE_UNLABELED,
  resolveTrainingMembershipTypeKey,
} from './membershipTypeStatsAgg.js'
import { computeTrainerSelfPayroll } from '../trainer/trainerSelfPayroll.js'
import { USERS_TRAINER_ROLES } from '../userRoleConstants.js'

function isTrainerRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  return USERS_TRAINER_ROLES.includes(r)
}

function trainingsInRange(trainings, dateFrom, dateTo, trainerId = null) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const tid = trainerId ? String(trainerId).trim() : ''
  return (trainings ?? []).filter((t) => {
    if (t.status !== 'completed') return false
    if (tid && String(t.trainer_id ?? '').trim() !== tid) return false
    const d = String(t.date ?? '').slice(0, 10)
    return d && d >= from && d <= to
  })
}

function countNoTypeCompleted(trainings, membershipById, trainerId, dateFrom, dateTo) {
  let n = 0
  for (const t of trainingsInRange(trainings, dateFrom, dateTo, trainerId)) {
    const key = resolveTrainingMembershipTypeKey(t, membershipById)
    if (key === MEMBERSHIP_TYPE_UNLABELED) n += 1
  }
  return n
}

function buildMembershipById(memberships) {
  const map = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (id) map.set(id, m)
  }
  return map
}

/** @param {Array<{ id: string, name?: string, role?: string }>} users @param {object[]} clients */
export function collectClubTrainerDirectory(users, clients) {
  /** @type {Map<string, { trainer_id: string, trainer_name: string }>} */
  const map = new Map()
  for (const u of users ?? []) {
    if (!isTrainerRole(u?.role)) continue
    const id = String(u?.id ?? '').trim()
    if (!id) continue
    map.set(id, { trainer_id: id, trainer_name: String(u?.name ?? '').trim() || '—' })
  }
  for (const c of clients ?? []) {
    const tid = String(c?.trainer_id ?? '').trim()
    if (!tid) continue
    if (!map.has(tid)) {
      map.set(tid, { trainer_id: tid, trainer_name: '—' })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.trainer_name.localeCompare(b.trainer_name, 'ru'),
  )
}

function buildYearlyCompletedTrend(trainings, trainerId, year) {
  const y = Number(year)
  const counts = Array(12).fill(0)
  if (!Number.isFinite(y) || y < 2000) return counts
  const prefix = `${y}-`
  const tid = String(trainerId ?? '').trim()
  for (const t of trainings ?? []) {
    if (t.status !== 'completed') continue
    if (String(t.trainer_id ?? '').trim() !== tid) continue
    const d = String(t.date ?? '').slice(0, 10)
    if (!d.startsWith(prefix)) continue
    const month = Number(d.slice(5, 7))
    if (month >= 1 && month <= 12) counts[month - 1] += 1
  }
  return counts
}

/**
 * @param {{
 *   trainers: Array<{ trainer_id: string, trainer_name: string }>,
 *   clients: object[],
 *   trainings: object[],
 *   memberships: object[],
 *   membershipTypes: object[],
 *   dateFrom: string,
 *   dateTo: string,
 *   year: number,
 *   selectedTrainerId?: string | null,
 * }} opts
 */
export function buildGeminiTrainerContour(opts) {
  const dateFrom = String(opts.dateFrom ?? '').slice(0, 10)
  const dateTo = String(opts.dateTo ?? '').slice(0, 10)
  const year = Number(opts.year)
  const membershipById = buildMembershipById(opts.memberships)
  const operationalClients = filterHallOperationalClients(
    opts.clients ?? [],
    opts.holdingTrainerIds,
    opts.noTabletTrainerIds,
  )
  const selectedTrainerId = String(opts.selectedTrainerId ?? '').trim() || null

  /** @type {Array<Record<string, unknown>>} */
  const trainerRows = []

  for (const tr of opts.trainers ?? []) {
    const trainerId = String(tr.trainer_id ?? '').trim()
    if (!trainerId) continue

    const myClients = operationalClients.filter((c) => String(c.trainer_id ?? '').trim() === trainerId)
  const clientPeriod = aggregateClubClientPeriod(myClients, opts.memberships ?? [], dateFrom, dateTo, undefined, {
    holdingTrainerIds: opts.holdingTrainerIds,
    noTabletTrainerIds: opts.noTabletTrainerIds,
  })
    const completed = trainingsInRange(opts.trainings, dateFrom, dateTo, trainerId).length
    const noType = countNoTypeCompleted(opts.trainings, membershipById, trainerId, dateFrom, dateTo)
    const personalSalary = computeTrainerSelfPayroll({
      trainings: opts.trainings ?? [],
      memberships: opts.memberships ?? [],
      membershipTypes: opts.membershipTypes ?? [],
      trainerId,
      dateFrom,
      dateTo,
    })

    const yearlyTrend =
      Number.isFinite(year) && year >= 2000
        ? buildYearlyCompletedTrend(opts.trainings, trainerId, year)
        : []

    trainerRows.push({
      trainer_id: trainerId,
      trainer_name: tr.trainer_name,
      personal_salary_month: personalSalary,
      completed_trainings: completed,
      no_type_trainings_ignored: noType,
      active_clients_total: clientPeriod.totalClients,
      current_active_holders: clientPeriod.activeWithMembership,
      inactive_clients_holders: clientPeriod.inactiveInPeriod,
      yearly_trend_completed: yearlyTrend,
    })
  }

  trainerRows.sort(
    (a, b) =>
      (Number(b.completed_trainings) || 0) - (Number(a.completed_trainings) || 0) ||
      String(a.trainer_name).localeCompare(String(b.trainer_name), 'ru'),
  )

  const clubRollUp = trainerRows.reduce(
    (acc, row) => {
      acc.completed_trainings += Number(row.completed_trainings) || 0
      acc.personal_salary_sum += Number(row.personal_salary_month) || 0
      acc.inactive_clients_holders += Number(row.inactive_clients_holders) || 0
      acc.no_type_trainings_ignored += Number(row.no_type_trainings_ignored) || 0
      return acc
    },
    {
      completed_trainings: 0,
      personal_salary_sum: 0,
      inactive_clients_holders: 0,
      no_type_trainings_ignored: 0,
      trainers_count: trainerRows.length,
    },
  )

  const selected =
    selectedTrainerId != null
      ? trainerRows.find((r) => r.trainer_id === selectedTrainerId) ?? null
      : null

  return {
    contour: 'trainer_tablets',
    isolated_from: 'sales_manager_reports',
    period: { from: dateFrom, to: dateTo },
    selected_trainer_id: selectedTrainerId,
    selected_trainer: selected,
    club_roll_up: clubRollUp,
    trainers: trainerRows,
    notes: [
      'personal_salary_month — личная ЗП по завершённым тренировкам × ставки типов карт (планшеты).',
      'Не суммировать с finance.trainer_payroll из контура продаж — другой алгоритм и источник.',
      'inactive_clients_holders — клиенты тренера без действующего абонемента на конец периода.',
    ],
  }
}

/**
 * Подставляет выбранного тренера в уже собранный snapshot (кэш месяца без привязки к фокусу).
 * @param {object | null | undefined} snapshot
 * @param {string | null | undefined} selectedTrainerId
 */
export function applyTrainerFocusToSnapshot(snapshot, selectedTrainerId) {
  if (!snapshot?.trainer_contour) return snapshot
  const sid = String(selectedTrainerId ?? '').trim()
  if (!sid) return snapshot

  const contour = snapshot.trainer_contour
  const selected =
    (contour.trainers ?? []).find((r) => r.trainer_id === sid) ?? contour.selected_trainer ?? null

  return {
    ...snapshot,
    trainer_contour: {
      ...contour,
      selected_trainer_id: sid,
      selected_trainer: selected,
    },
  }
}

/** @param {object | null | undefined} contour @param {string | null | undefined} selectedId */
export function compactTrainerContourForPrompt(contour, selectedId = null) {
  if (!contour || typeof contour !== 'object') return null
  const sid = String(selectedId ?? contour.selected_trainer_id ?? '').trim() || null
  const trainers = Array.isArray(contour.trainers) ? contour.trainers : []
  const pick = sid ? trainers.find((t) => t.trainer_id === sid) : null

  return {
    contour: contour.contour,
    isolated_from: contour.isolated_from,
    period: contour.period,
    selected_trainer_id: sid,
    selected_trainer: pick ?? contour.selected_trainer ?? null,
    club_roll_up: contour.club_roll_up,
    trainers: trainers.slice(0, 25).map((t) => ({
      trainer_id: t.trainer_id,
      trainer_name: t.trainer_name,
      personal_salary_month: t.personal_salary_month,
      completed_trainings: t.completed_trainings,
      no_type_trainings_ignored: t.no_type_trainings_ignored,
      active_clients_total: t.active_clients_total,
      current_active_holders: t.current_active_holders,
      inactive_clients_holders: t.inactive_clients_holders,
    })),
    notes: contour.notes,
  }
}
