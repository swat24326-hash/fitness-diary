import { filterOperationalClients } from '../clientArchive.js'
import { membershipSignal } from '../clientListSignals.js'
import { todayLocalIso } from '../dateRu.js'
import { aggregateClubClientPeriod } from './clubClientPeriodAgg.js'

/** @param {string} todayIso yyyy-mm-dd */
export function yesterdayIso(todayIso = todayLocalIso()) {
  const s = String(todayIso ?? '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  dt.setDate(dt.getDate() - 1)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
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
 */
export function countClubExpiringMemberships(clientRows, membershipRows, today = todayLocalIso()) {
  const byClient = buildMembershipsByClientId(membershipRows)
  let count = 0
  for (const c of filterOperationalClients(clientRows)) {
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
 * }} input
 */
export function buildAdminClubDaySummary(input = {}) {
  const today = String(input.today ?? todayLocalIso()).slice(0, 10)
  const yesterday = String(input.yesterday ?? yesterdayIso(today)).slice(0, 10)
  const clients = input.clients ?? []
  const memberships = input.memberships ?? []
  const trainings = input.trainings ?? []

  const period = aggregateClubClientPeriod(clients, memberships, today, today, today)
  const todayTrainings = countTrainingsOnDate(trainings, today)
  const yesterdayTrainings = countTrainingsOnDate(trainings, yesterday)
  const expiring = countClubExpiringMemberships(clients, memberships, today)

  const actionable =
    period.inactiveInPeriod +
    expiring +
    (input.salesReportFilled === false ? 1 : 0)

  return {
    today,
    yesterday,
    totalClients: period.totalClients,
    inactive: period.inactiveInPeriod,
    expiring,
    trainingsToday: todayTrainings.completed,
    trainingsYesterday: yesterdayTrainings.completed,
    draftsToday: todayTrainings.draft,
    salesReportFilled: input.salesReportFilled ?? null,
    actionable,
  }
}
