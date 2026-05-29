import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import { aggregateMonthlyTypedCompleted } from '../admin/adminClubMonthlyService'

function flattenMemberships(memByClient) {
  const out = []
  for (const list of Object.values(memByClient ?? {})) {
    if (Array.isArray(list)) out.push(...list)
  }
  return out
}

function monthStartIso(year, month1) {
  return `${year}-${String(month1).padStart(2, '0')}-01`
}

function buildMonthKeys(anchorToIso, months) {
  const end = String(anchorToIso ?? '').slice(0, 10)
  const y = Number(end.slice(0, 4))
  const m1 = Number(end.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m1)) return []
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m1 - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/**
 * @param {{ trainerId: string, clubId: string | null, anchorTo: string, months?: number }} p
 */
export async function loadTrainerMonthlyStats(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const to = String(p.anchorTo ?? '').slice(0, 10)
  const n = Math.max(3, Math.min(36, Number(p.months) || 12))
  if (!trainerId || !to) return { months: [] }

  const keys = buildMonthKeys(to, n)
  if (!keys.length) return { months: [] }

  const { trainings, memByClient } = await loadTrainerWorkspaceSnapshot(trainerId, clubId || null)
  const memberships = flattenMemberships(memByClient)

  const first = keys[0]
  const [fy, fm] = first.split('-').map((x) => Number(x))
  const dateFrom = monthStartIso(fy, fm)
  const dateTo = to

  const inRange = (trainings ?? []).filter((t) => {
    if (String(t.trainer_id) !== trainerId) return false
    const d = String(t.date ?? '').slice(0, 10)
    return d && d >= dateFrom && d <= dateTo
  })

  return {
    months: aggregateMonthlyTypedCompleted({
      trainings: inRange,
      memberships,
      anchorTo: to,
      months: n,
    }),
  }
}
