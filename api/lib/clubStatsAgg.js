/** Агрегация статистики клуба (дублирует логику src/lib/admin/adminClubStatsService.js). */

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
  const covering = list.filter((m) => membershipCoversDate(m, d))
  if (covering.some((m) => !membershipHasRemaining(m))) return 'depleted'
  if (list.every((m) => String(m.start_date ?? '') > d)) return 'not_started'
  return 'expired'
}

export function aggregateClubClientPeriod(clientRows, membershipRows, dateFrom, dateTo, asOf) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const totalClients = clientRows.length
  const clientIdSet = new Set(clientRows.map((c) => c.id).filter(Boolean))
  const clientById = new Map()
  for (const c of clientRows ?? []) {
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
    const reason = inactiveMembershipReason(mems, ref)
    inactiveClients.push({
      id,
      name: String(client?.name ?? '').trim() || '—',
      phone: client?.phone ? String(client.phone).trim() : null,
      inactiveReason: reason ?? 'expired',
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
