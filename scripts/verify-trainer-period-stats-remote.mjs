/**
 * Границы периода для удалённой подгрузки статистики тренера.
 * node scripts/verify-trainer-period-stats-remote.mjs
 */
import { previousEqualPeriod } from '../src/lib/admin/coachQualityBriefCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

{
  const prev = previousEqualPeriod('2026-07-01', '2026-07-31')
  ok(!!prev, 'prev period exists')
  const fetchFrom = prev.dateFrom
  ok(fetchFrom < '2026-07-01', 'облако тянем раньше начала выбранного периода')
  ok(prev.dateTo === '2026-06-30', 'prev ends day before July')
}

{
  const prev = previousEqualPeriod('2026-07-28', '2026-07-28')
  ok(prev?.dateFrom === '2026-07-27' && prev?.dateTo === '2026-07-27', 'один день')
}

{
  // merge: remote wins in range, local outside kept
  const local = [
    { id: 'a', date: '2026-05-01' },
    { id: 'b', date: '2026-07-10' },
    { id: 'c', date: '2026-08-01' },
  ]
  const remote = [{ id: 'b', date: '2026-07-10', status: 'completed' }]
  const fetchFrom = '2026-06-01'
  const dateTo = '2026-07-31'
  const remoteIds = new Set(remote.map((t) => String(t.id)))
  const keepLocal = local.filter((t) => {
    if (remoteIds.has(String(t.id))) return false
    const d = String(t.date).slice(0, 10)
    return !d || d < fetchFrom || d > dateTo
  })
  const merged = [...keepLocal, ...remote]
  ok(merged.length === 3, 'merge length 3')
  ok(merged.some((t) => t.id === 'a'), 'keep before range')
  ok(merged.some((t) => t.id === 'c'), 'keep after range')
  ok(merged.find((t) => t.id === 'b')?.status === 'completed', 'remote wins in range')
}

console.log('verify-trainer-period-stats-remote: all passed')
