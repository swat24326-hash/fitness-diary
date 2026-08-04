/** Клиенты клуба за период (зеркало api/_lib/clubStatsAgg.js → aggregateClubClientPeriod). */

import {
  hasUsableMembershipForPeriodStats,
  inactiveMembershipDetail,
  inactiveMembershipReferenceDate,
  membershipCoversDate,
} from '../membershipRules.js'
import {
  filterCommercialClients,
} from './holdingClientsCore.js'
import { isClientOnNoTabletTrainer } from './trainerTabletModeCore.js'

/** Действующий абон для коммерции: занятия ИЛИ пакет по сроку (total_trainings = 0, как lite/desk). */
function hasCommercialActiveMembership(memberships, dateFrom, dateTo, asOf) {
  if (hasUsableMembershipForPeriodStats(memberships, dateFrom, dateTo, asOf)) return true
  const ref = inactiveMembershipReferenceDate(dateFrom, dateTo, asOf)
  for (const m of memberships ?? []) {
    const total = Number(m?.total_trainings ?? 0)
    if (Number.isFinite(total) && total > 0) continue
    if (membershipCoversDate(m, ref)) return true
  }
  return false
}

/**
 * Пул для абонов / «с действующим» — commercial (lite ПЗ внутри).
 * «Неактивные» (хвост дневника) — без lite: пустой дневник не раздувает SMS/KPI.
 *
 * @param {{ id: string, name?: string, phone?: string, trainer_id?: string }[]} clientRows
 * @param {Array<{ client_id?: string, start_date?: string, end_date?: string, total_trainings?: number, used_trainings?: number }>} membershipRows
 * @param {string} dateFrom yyyy-mm-dd
 * @param {string} dateTo yyyy-mm-dd
 * @param {string} [asOf] yyyy-mm-dd — «сегодня» для отчёта (по умолчанию локальная дата устройства)
 * @param {{ holdingTrainerIds?: Set<string>|string[], noTabletTrainerIds?: Set<string>|string[] }} [opts]
 */
export function aggregateClubClientPeriod(clientRows, membershipRows, dateFrom, dateTo, asOf, opts = {}) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const commercial = filterCommercialClients(clientRows, opts?.holdingTrainerIds).filter(
    (c) => String(c?.lifecycle ?? 'active') !== 'pnk',
  )
  const totalClients = commercial.length
  const clientIdSet = new Set(commercial.map((c) => c.id).filter(Boolean))
  const clientById = new Map()
  for (const c of commercial) {
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
    if (hasCommercialActiveMembership(mems, from, to, asOf)) {
      activeWithMembership++
      continue
    }
    const client = clientById.get(id)
    // Lite ПЗ: без дневника — не в «Неактивные» / SMS «вернись», но в activeWithMembership уже учтены.
    if (isClientOnNoTabletTrainer(client, opts?.noTabletTrainerIds)) continue
    const ref = inactiveMembershipReferenceDate(from, to, asOf)
    const { reason, inactiveDetail, membershipEndDate, membershipStartDate } = inactiveMembershipDetail(mems, ref)
    // Ждёт старт купленного абонемента — не в «Не активные» (не цель для SMS «вернись»).
    if (reason === 'not_started') continue
    inactiveClients.push({
      id,
      name: String(client?.name ?? '').trim() || '—',
      phone: client?.phone ? String(client.phone).trim() : null,
      trainerId: client?.trainer_id ? String(client.trainer_id).trim() : null,
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
