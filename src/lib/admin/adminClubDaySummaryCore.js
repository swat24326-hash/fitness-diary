import { filterCommercialClients } from './holdingClientsCore.js'
import { membershipSignal } from '../clientListSignals.js'
import { todayInTimeZoneIso } from '../dateRu.js'
import { aggregateClubClientPeriod } from './clubClientPeriodAgg.js'
import { buildAdminPzDaySummaryBrowseCounts } from './adminClientsBrowseFilterCore.js'
import { shouldReloadAdminDaySummaryFromStorage } from './adminClientsListReloadCore.js'

/** @param {string} todayIso yyyy-mm-dd */
export function yesterdayIso(todayIso = todayInTimeZoneIso()) {
  const s = String(todayIso ?? '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * @param {Array<{ client_id?: string }>} membershipRows
 * @returns {Map<string, object[]>}
 */
export function buildMembershipsByClientId(membershipRows) {
  const map = new Map()
  for (const row of membershipRows ?? []) {
    const cid = String(row?.client_id ?? '').trim()
    if (!cid) continue
    if (!map.has(cid)) map.set(cid, [])
    map.get(cid).push(row)
  }
  return map
}

/**
 * @param {object[]} clientRows
 * @param {object[]} membershipRows
 * @param {string} today
 * @param {Set<string>|string[]|null} [holdingTrainerIds]
 */
export function countClubExpiringMemberships(
  clientRows,
  membershipRows,
  today = todayInTimeZoneIso(),
  holdingTrainerIds,
  _noTabletTrainerIds,
) {
  const byClient = buildMembershipsByClientId(membershipRows)
  let count = 0
  for (const c of filterCommercialClients(clientRows, holdingTrainerIds)) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    if (membershipSignal(byClient.get(id) ?? [], today).key === 'expiring') count++
  }
  return count
}

/** @param {object[]} trainings */
export function countTrainingsOnDate(trainings, iso) {
  const day = String(iso ?? '').slice(0, 10)
  let completed = 0
  let draft = 0
  for (const t of trainings ?? []) {
    if (String(t?.date ?? '').slice(0, 10) !== day) continue
    if (t?.status === 'completed') completed++
    if (t?.status === 'draft') draft++
  }
  return { completed, draft }
}

/**
 * @param {{
 *   today?: string,
 *   yesterday?: string,
 *   clients?: object[],
 *   memberships?: object[],
 *   trainings?: object[],
 *   salesReportFilled?: boolean | null,
 *   inactiveOverride?: number | null,
 *   trainingsTodayOverride?: number | null,
 *   trainingsYesterdayOverride?: number | null,
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   lifecycleRows?: object[],
 * }} input
 */
export function buildAdminClubDaySummary(input = {}) {
  const today = String(input.today ?? todayInTimeZoneIso()).slice(0, 10)
  const yesterday = String(input.yesterday ?? yesterdayIso(today)).slice(0, 10)
  const clients = input.clients ?? []
  const memberships = input.memberships ?? []
  const trainings = input.trainings ?? []
  const holdingTrainerIds = input.holdingTrainerIds
  const noTabletTrainerIds = input.noTabletTrainerIds

  const period = aggregateClubClientPeriod(clients, memberships, today, today, today, {
    holdingTrainerIds,
    noTabletTrainerIds,
  })
  const todayTrainings = countTrainingsOnDate(trainings, today)
  const yesterdayTrainings = countTrainingsOnDate(trainings, yesterday)
  const byClientMap = buildMembershipsByClientId(memberships)
  /** @type {Record<string, object[]>} */
  const memByClient = Object.fromEntries(byClientMap)
  const funnel = buildAdminPzDaySummaryBrowseCounts(
    clients,
    memByClient,
    today,
    input.lifecycleRows ?? [],
  )

  // Чип/карточка «Не активные» на дашборде = финал воронки (не широкий census периода).
  const inactive =
    Number.isFinite(input.inactiveOverride) ? Number(input.inactiveOverride) : funnel.inactive
  const trainingsToday =
    Number.isFinite(input.trainingsTodayOverride) ? Number(input.trainingsTodayOverride) : todayTrainings.completed
  const trainingsYesterday =
    Number.isFinite(input.trainingsYesterdayOverride)
      ? Number(input.trainingsYesterdayOverride)
      : yesterdayTrainings.completed

  const expiring = funnel.expiring
  const actionable =
    inactive +
    expiring +
    funnel.expired_recent +
    funnel.stale +
    (input.salesReportFilled === false ? 1 : 0)

  return {
    today,
    yesterday,
    totalClients: period.totalClients,
    inactive,
    expiring,
    expired_recent: funnel.expired_recent,
    stale: funnel.stale,
    awaiting_start: funnel.awaiting_start,
    birthdays: funnel.birthdays,
    trainingsToday,
    trainingsYesterday,
    draftsToday: todayTrainings.draft,
    salesReportFilled: input.salesReportFilled ?? null,
    actionable,
    pnk: funnel.pnk,
  }
}

/** События IDB, после которых нужно обновить сводку дня (без справочников и очереди sync). */
export function shouldReloadAdminDaySummary(detail = {}) {
  return shouldReloadAdminDaySummaryFromStorage(detail)
}
