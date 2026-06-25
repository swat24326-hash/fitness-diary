function monthKey(iso) {
  return String(iso ?? '').slice(0, 7)
}

function buildMonthKeys(anchorToIso, months) {
  const to = String(anchorToIso ?? '').slice(0, 10)
  const y = Number(to.slice(0, 4))
  const m1 = Number(to.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m1)) return []
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m1 - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
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
    const day = String(t?.date ?? '').slice(0, 10)
    if (!day.slice(0, 7).startsWith(prefix)) continue
    completedInYear++
    const mid = String(t?.data?.membership_id ?? '').trim()
    if (!mid) continue
    if (membershipTypeById.get(mid)) typedInYear++
  }

  return { completedInYear, typedInYear }
}

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

