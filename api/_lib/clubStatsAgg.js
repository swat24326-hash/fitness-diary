/** Агрегация статистики клуба (дублирует логику src/lib/admin/adminClubStatsService.js). */

import { filterCommercialClients } from '../../src/lib/admin/holdingClientsCore.js'
import { isClientOnNoTabletTrainer } from '../../src/lib/admin/trainerTabletModeCore.js'

export function aggregateTrainings(rows) {
  const dayMap = new Map()
  const trainerMap = new Map()
  const clientSet = new Set()
  let totalCompleted = 0
  let totalDraft = 0

  for (const t of rows) {
    const d = String(t.date ?? '').slice(0, 10)
    if (!d) continue
    const isDone = t.status === 'completed'
    const isDraft = t.status === 'draft'
    if (!isDone && !isDraft) continue

    const tid = t.trainer_id || ''
    if (isDone) totalCompleted++
    if (isDraft) totalDraft++
    if (t.client_id) clientSet.add(t.client_id)

    if (!dayMap.has(d)) dayMap.set(d, { completed: 0, draft: 0 })
    const day = dayMap.get(d)
    if (isDone) day.completed++
    if (isDraft) day.draft++

    if (tid) {
      if (!trainerMap.has(tid)) {
        trainerMap.set(tid, { completed: 0, draft: 0, clientIds: new Set() })
      }
      const tr = trainerMap.get(tid)
      if (isDone) tr.completed++
      if (isDraft) tr.draft++
      if (t.client_id) tr.clientIds.add(t.client_id)
    }
  }

  const byDay = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, completed: v.completed, draft: v.draft }))

  const byTrainer = [...trainerMap.entries()]
    .map(([trainerId, v]) => ({
      trainerId,
      completed: v.completed,
      draft: v.draft,
      uniqueClients: v.clientIds.size,
    }))
    .sort((a, b) => b.completed - a.completed || b.draft - a.draft)

  return {
    totalCompleted,
    totalDraft,
    uniqueClients: clientSet.size,
    totalRows: rows.length,
    byDay,
    byTrainer,
  }
}

function membershipCoversDate(m, dateIso) {
  const s = m?.start_date
  const e = m?.end_date
  if (!s || !e || !dateIso) return false
  const d = String(dateIso)
  return String(s) <= d && String(e) >= d
}

function membershipHasRemaining(m) {
  const total = Number(m?.total_trainings ?? 0)
  const used = Number(m?.used_trainings ?? 0)
  return Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
}

function hasUsableMembershipOnDate(memberships, dateIso) {
  return (memberships ?? []).some((m) => membershipCoversDate(m, dateIso) && membershipHasRemaining(m))
}

function todayLocalIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inactiveMembershipReferenceDate(dateFrom, dateTo, asOf = todayLocalIso()) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const today = String(asOf ?? '').slice(0, 10)
  if (!from || !to || from > to) return to || today
  if (today < from) return from
  if (today > to) return to
  return today
}

function hasUsableMembershipForPeriodStats(memberships, dateFrom, dateTo, asOf = todayLocalIso()) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const ref = inactiveMembershipReferenceDate(from, to, asOf)
  if (hasUsableMembershipOnDate(memberships, ref)) return true
  if (ref !== to) return false
  for (const m of memberships ?? []) {
    const s = String(m.start_date ?? '').slice(0, 10)
    const e = String(m.end_date ?? '').slice(0, 10)
    if (!s || !e || e < from || s > to) continue
    if (e >= ref) continue
    const lastDay = e
    if (lastDay >= from && membershipCoversDate(m, lastDay) && membershipHasRemaining(m)) return true
  }
  return false
}

function inactiveMembershipReason(memberships, dateIso) {
  if (hasUsableMembershipOnDate(memberships, dateIso)) return null
  const list = memberships ?? []
  if (!list.length) return 'no_membership'
  const d = String(dateIso ?? '')
  // Куплен следующий (даже если текущий исчерпан по лимиту) — не «пропал», а ждёт старт.
  if (hasUpcomingMembership(list, d) || list.every((m) => String(m.start_date ?? '') > d)) {
    return 'not_started'
  }
  const covering = list.filter((m) => membershipCoversDate(m, d))
  if (covering.some((m) => !membershipHasRemaining(m))) return 'depleted'
  return 'expired'
}

function hasUpcomingMembership(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return false
  return (memberships ?? []).some((m) => {
    const s = String(m?.start_date ?? '').slice(0, 10)
    const e = String(m?.end_date ?? '').slice(0, 10)
    if (!s || !e || s <= d) return false
    return membershipHasRemaining(m)
  })
}

function formatDateRu(isoLike) {
  const s = String(isoLike ?? '').slice(0, 10)
  const parts = s.split('-')
  if (parts.length !== 3) return s
  const [y, m, d] = parts
  return `${d}.${m}.${y}`
}

function inactiveMembershipDetail(memberships, dateIso) {
  const reason = inactiveMembershipReason(memberships, dateIso) ?? 'expired'
  const list = memberships ?? []
  const d = String(dateIso ?? '')
  const withDates = list.filter((m) => m?.start_date && m?.end_date)
  const labels = {
    depleted: 'тренировки закончились',
    expired: 'срок абонемента прошёл',
    not_started: 'абонемент ещё не начался',
    no_membership: 'нет абонемента',
  }

  if (reason === 'no_membership') {
    return { reason, inactiveDetail: labels.no_membership }
  }
  if (reason === 'not_started') {
    const future = withDates
      .filter((m) => String(m.start_date) > d)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
    const startRu = future ? formatDateRu(future.start_date) : null
    return {
      reason,
      inactiveDetail: startRu ? `абонемент начнётся ${startRu}` : labels.not_started,
      membershipStartDate: future?.start_date ?? null,
    }
  }
  if (reason === 'depleted') {
    const covering = withDates.filter((m) => membershipCoversDate(m, d))
    const depleted =
      covering
        .filter((m) => !membershipHasRemaining(m))
        .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0] ??
      withDates
        .filter((m) => !membershipHasRemaining(m))
        .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0]
    if (depleted) {
      const used = Number(depleted.used_trainings ?? 0)
      const total = Number(depleted.total_trainings ?? 0)
      return {
        reason,
        inactiveDetail: `тренировки закончились (${used}/${total}), срок до ${formatDateRu(depleted.end_date)}`,
        membershipEndDate: depleted.end_date,
      }
    }
    return { reason, inactiveDetail: labels.depleted }
  }
  const expired = withDates
    .filter((m) => String(m.end_date) < d)
    .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0]
  if (expired) {
    const used = Number(expired.used_trainings ?? 0)
    const total = Number(expired.total_trainings ?? 0)
    const remain =
      Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
        ? `, осталось ${total - used}/${total}`
        : ''
    return {
      reason,
      inactiveDetail: `срок абонемента закончился ${formatDateRu(expired.end_date)}${remain}`,
      membershipEndDate: expired.end_date,
    }
  }
  return { reason, inactiveDetail: labels.expired }
}

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

  const ref = inactiveMembershipReferenceDate(from, to, asOf)
  const hasCommercialActive = (mems) => {
    if (hasUsableMembershipForPeriodStats(mems, from, to, asOf)) return true
    for (const m of mems ?? []) {
      const total = Number(m?.total_trainings ?? 0)
      if (Number.isFinite(total) && total > 0) continue
      if (membershipCoversDate(m, ref)) return true
    }
    return false
  }

  let activeWithMembership = 0
  const inactiveClients = []

  for (const id of clientIdSet) {
    const mems = byClient.get(id) ?? []
    if (hasCommercialActive(mems)) {
      activeWithMembership++
      continue
    }
    const client = clientById.get(id)
    if (isClientOnNoTabletTrainer(client, opts?.noTabletTrainerIds)) continue
    const { reason, inactiveDetail, membershipEndDate, membershipStartDate } = inactiveMembershipDetail(mems, ref)
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
    notRenewedInPeriod: 0,
    notRenewedClients: [],
  }
}
