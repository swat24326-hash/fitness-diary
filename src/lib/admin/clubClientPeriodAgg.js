/** Клиенты клуба за период (зеркало api/lib/clubStatsAgg.js → aggregateClubClientPeriod). */

import {
  hasUsableMembershipForPeriodStats,
  inactiveMembershipDetail,
  inactiveMembershipReferenceDate,
} from '../membershipRules.js'
import { filterOperationalClients } from '../clientArchive.js'

/**
 * @param {{ id: string, name?: string, phone?: string }[]} clientRows
 * @param {Array<{ client_id?: string, start_date?: string, end_date?: string, total_trainings?: number, used_trainings?: number }>} membershipRows
 * @param {string} dateFrom yyyy-mm-dd
 * @param {string} dateTo yyyy-mm-dd
 */
/** @param {string} [asOf] yyyy-mm-dd — «сегодня» для отчёта (по умолчанию локальная дата устройства) */
export function aggregateClubClientPeriod(clientRows, membershipRows, dateFrom, dateTo, asOf) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const operational = filterOperationalClients(clientRows)
  const totalClients = operational.length
  const clientIdSet = new Set(operational.map((c) => c.id).filter(Boolean))
  const clientById = new Map()
  for (const c of operational) {
    const id = String(c?.id ?? '').trim()
    if (id) clientById.set(id, c)
  }
  const byClient = new Map()
  for (const id of clientIdSet) byClient.set(id, [])
  for (const m of membershipRows) {
    const cid = m.client_id
    if (!cid || !clientIdSet.has(cid)) continue
    byClient.get(cid).push(m)
  }

  let activeWithMembership = 0
  const inactiveClients = []

  for (const id of clientIdSet) {
    const mems = byClient.get(id) ?? []
    if (hasUsableMembershipForPeriodStats(mems, from, to, asOf)) {
      activeWithMembership++
      continue
    }
    const client = clientById.get(id)
    const ref = inactiveMembershipReferenceDate(from, to, asOf)
    const { reason, inactiveDetail, membershipEndDate, membershipStartDate } = inactiveMembershipDetail(mems, ref)
    inactiveClients.push({
      id,
      name: String(client?.name ?? '').trim() || '—',
      phone: client?.phone ? String(client.phone).trim() : null,
      inactiveReason: reason,
      inactiveDetail,
      membershipEndDate: membershipEndDate ?? null,
      membershipStartDate: membershipStartDate ?? null,
    })
  }
  inactiveClients.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return {
    totalClients,
    activeWithMembership,
    inactiveInPeriod: inactiveClients.length,
    inactiveClients,
    /** @deprecated объединено с inactiveClients */
    notRenewedInPeriod: 0,
    notRenewedClients: [],
  }
}
