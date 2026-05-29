import { isSupabaseConfigured } from '../supabase'
import { getDb } from '../localDb'
import { fetchClubMonthlyStatsViaApi } from './adminApiClient'

function monthStartIso(year, month1) {
  const y = String(year)
  const m = String(month1).padStart(2, '0')
  return `${y}-${m}-01`
}

function addMonths(y, m1, delta) {
  const d = new Date(y, m1 - 1 + delta, 1)
  return { y: d.getFullYear(), m1: d.getMonth() + 1 }
}

function monthKey(isoDate) {
  return String(isoDate ?? '').slice(0, 7)
}

function buildMonthKeys(anchorToIso, months) {
  const end = String(anchorToIso ?? '').slice(0, 10)
  const y = Number(end.slice(0, 4))
  const m1 = Number(end.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m1)) return []
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const p = addMonths(y, m1, -i)
    out.push(`${p.y}-${String(p.m1).padStart(2, '0')}`)
  }
  return out
}

function aggregateMonthlyTypedCompleted({ trainings, memberships, anchorTo, months }) {
  const membershipTypeById = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (!id) continue
    const tid = String(m?.membership_type_id ?? '').trim()
    membershipTypeById.set(id, tid || null)
  }

  const keys = buildMonthKeys(anchorTo, months)
  const counts = new Map(keys.map((k) => [k, 0]))

  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    const mid = String(t?.data?.membership_id ?? '').trim()
    if (!mid) continue
    const tid = membershipTypeById.get(mid)
    if (!tid) continue // без типа не считаем
    const mk = monthKey(t?.date)
    if (!mk || !counts.has(mk)) continue
    counts.set(mk, (counts.get(mk) || 0) + 1)
  }

  return keys.map((k) => ({ month: k, count: counts.get(k) || 0 }))
}

export async function loadClubMonthlyStats({ clubId, anchorTo, months = 12 }) {
  const cid = String(clubId ?? '').trim()
  const to = String(anchorTo ?? '').slice(0, 10)
  const n = Math.max(3, Math.min(36, Number(months) || 12))
  if (!cid || !to) return { months: [] }

  if (isSupabaseConfigured()) {
    try {
      const via = await fetchClubMonthlyStatsViaApi({ clubId: cid, anchorTo: to, months: n })
      if (via) return { months: Array.isArray(via.months) ? via.months : [] }
    } catch {
      // fallback below
    }
  }

  const keys = buildMonthKeys(to, n)
  if (!keys.length) return { months: [] }
  const first = keys[0]
  const [fy, fm] = first.split('-').map((x) => Number(x))
  const dateFrom = monthStartIso(fy, fm)
  const dateTo = `${to.slice(0, 7)}-31`

  try {
    const db = await getDb()
    const [trainingsAll, membershipsAll] = await Promise.all([db.getAll('trainings'), db.getAll('memberships')])
    const trainings = trainingsAll.filter((t) => t.club_id === cid && String(t.date ?? '').slice(0, 10) >= dateFrom && String(t.date ?? '').slice(0, 10) <= dateTo)
    const memberships = membershipsAll.filter((m) => m.club_id === cid)
    return { months: aggregateMonthlyTypedCompleted({ trainings, memberships, anchorTo: to, months: n }) }
  } catch {
    return { months: [] }
  }
}

