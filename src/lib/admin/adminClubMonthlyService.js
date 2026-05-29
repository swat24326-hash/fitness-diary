import { isSupabaseConfigured } from '../supabase'
import { getDb } from '../localDb'
import { fetchClubMonthlyStatsViaApi, fetchClubMonthlyStatsForYearViaApi } from './adminApiClient'

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

export function aggregateMonthlyTypedCompleted({ trainings, memberships, anchorTo, months }) {
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

export const MONTHS_PER_CALENDAR_YEAR = 12

/** @param {number} year */
export function buildCalendarYearMonthKeys(year) {
  const y = Number(year)
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return []
  const out = []
  for (let m = 1; m <= MONTHS_PER_CALENDAR_YEAR; m++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out
}

/**
 * Завершённые тренировки с типом карты — по календарным месяцам одного года (янв–дек).
 * @param {{ trainings: object[], memberships: object[], year: number }} input
 */
export function aggregateMonthlyForCalendarYear({ trainings, memberships, year }) {
  const y = Number(year)
  if (!Number.isFinite(y)) return []

  const membershipTypeById = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (!id) continue
    const tid = String(m?.membership_type_id ?? '').trim()
    membershipTypeById.set(id, tid || null)
  }

  const keys = buildCalendarYearMonthKeys(y)
  const counts = new Map(keys.map((k) => [k, 0]))
  const prefix = `${y}-`

  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    const mid = String(t?.data?.membership_id ?? '').trim()
    if (!mid) continue
    const tid = membershipTypeById.get(mid)
    if (!tid) continue
    const mk = monthKey(t?.date)
    if (!mk.startsWith(prefix) || !counts.has(mk)) continue
    counts.set(mk, (counts.get(mk) || 0) + 1)
  }

  return keys.map((k) => ({ month: k, count: counts.get(k) || 0 }))
}

/**
 * Сводка за календарный год: все завершённые vs попадающие в помесячный график (с типом карты).
 * @param {{ trainings: object[], memberships: object[], year: number }} input
 */
export function summarizeCalendarYearMonthlyEligibility({ trainings, memberships, year }) {
  const y = Number(year)
  if (!Number.isFinite(y)) return { completedInYear: 0, typedInYear: 0 }

  const membershipTypeById = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (!id) continue
    const tid = String(m?.membership_type_id ?? '').trim()
    membershipTypeById.set(id, tid || null)
  }

  const prefix = `${y}-`
  let completedInYear = 0
  let typedInYear = 0

  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    if (!String(t?.date ?? '').slice(0, 7).startsWith(prefix)) continue
    completedInYear++
    const mid = String(t?.data?.membership_id ?? '').trim()
    if (!mid) continue
    if (membershipTypeById.get(mid)) typedInYear++
  }

  return { completedInYear, typedInYear }
}

/**
 * Годы для переключателей: от текущего календарного до первого года с завершёнными тренировками.
 * @param {object[]} trainings
 * @param {{ anchorYear?: number }} [opts]
 */
export function discoverMonthlyChartYears(trainings, opts = {}) {
  const now = new Date().getFullYear()
  const anchor = Number(opts.anchorYear)
  let maxY = Math.max(now, Number.isFinite(anchor) ? anchor : now)
  let minY = maxY

  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    const y = Number(String(t.date ?? '').slice(0, 4))
    if (!Number.isFinite(y) || y < 2000 || y > now + 1) continue
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const out = []
  for (let y = maxY; y >= minY; y--) out.push(y)
  return out.length ? out : [maxY]
}

/**
 * @param {{ clubId: string, year: number }} p
 */
export async function loadClubMonthlyStatsForYear({ clubId, year }) {
  const cid = String(clubId ?? '').trim()
  const y = Number(year)
  if (!cid || !Number.isFinite(y)) return { months: [], years: [] }

  const dateFrom = `${y}-01-01`
  const dateTo = `${y}-12-31`

  if (isSupabaseConfigured()) {
    try {
      const via = await fetchClubMonthlyStatsForYearViaApi({ clubId: cid, year: y })
      if (via && Array.isArray(via.months)) {
        return {
          months: via.months,
          years: Array.isArray(via.years)?.length ? via.years : [y],
          yearSummary: via.yearSummary ?? { completedInYear: 0, typedInYear: 0 },
        }
      }
    } catch {
      // локальный кэш ниже
    }
  }

  try {
    const db = await getDb()
    const [trainingsAll, membershipsAll] = await Promise.all([db.getAll('trainings'), db.getAll('memberships')])
    const trainings = trainingsAll.filter(
      (t) => t.club_id === cid && String(t.date ?? '').slice(0, 10) >= dateFrom && String(t.date ?? '').slice(0, 10) <= dateTo,
    )
    const memberships = membershipsAll.filter((m) => m.club_id === cid)
    const clubTrainings = trainingsAll.filter((t) => t.club_id === cid)
    const yearSummary = summarizeCalendarYearMonthlyEligibility({ trainings, memberships, year: y })
    return {
      months: aggregateMonthlyForCalendarYear({ trainings, memberships, year: y }),
      years: discoverMonthlyChartYears(clubTrainings, { anchorYear: y }),
      yearSummary,
    }
  } catch {
    return { months: [], years: [y], yearSummary: { completedInYear: 0, typedInYear: 0 } }
  }
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

