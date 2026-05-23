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

export function aggregateClubClientPeriod(clientRows, membershipRows, dateFrom, dateTo) {
  const totalClients = clientRows.length
  const clientIdSet = new Set(clientRows.map((c) => c.id).filter(Boolean))
  const byClient = new Map()
  for (const id of clientIdSet) byClient.set(id, [])
  for (const m of membershipRows) {
    const cid = m.client_id
    if (!cid || !clientIdSet.has(cid)) continue
    byClient.get(cid).push(m)
  }

  let activeWithMembership = 0
  for (const id of clientIdSet) {
    if (hasUsableMembershipOnDate(byClient.get(id) ?? [], dateTo)) activeWithMembership++
  }

  let notRenewedInPeriod = 0
  for (const id of clientIdSet) {
    const mems = byClient.get(id) ?? []
    if (hasUsableMembershipOnDate(mems, dateTo)) continue
    const endedInRange = mems.some((m) => {
      const e = String(m.end_date ?? '').slice(0, 10)
      return e && e >= dateFrom && e <= dateTo
    })
    if (endedInRange) notRenewedInPeriod++
  }

  return { totalClients, activeWithMembership, notRenewedInPeriod }
}
