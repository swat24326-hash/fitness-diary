import {
  aggregateMonthlyForCalendarYear,
  summarizeCalendarYearMonthlyEligibility,
} from '../api/lib/clubMonthlyAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const memberships = [{ id: 'm1', membership_type_id: 't12' }]
const trainings = [
  { date: '2026-01-15', status: 'completed', data: { membership_id: 'm1' } },
  { date: '2026-05-20', status: 'completed', data: { membership_id: 'm1' } },
  { date: '2026-12-01', status: 'completed', data: { membership_id: 'm1' } },
]

const months = aggregateMonthlyForCalendarYear({ trainings, memberships, year: 2026 })
const jan = months.find((r) => r.month === '2026-01')?.count ?? 0
const may = months.find((r) => r.month === '2026-05')?.count ?? 0
const dec = months.find((r) => r.month === '2026-12')?.count ?? 0

ok(jan === 1, 'jan counted')
ok(may === 1, 'may counted')
ok(dec === 1, 'dec counted')
ok(months.reduce((s, r) => s + r.count, 0) === 3, 'full year total')

const summary = summarizeCalendarYearMonthlyEligibility({ trainings, memberships, year: 2026 })
ok(summary.completedInYear === 3, 'summary all year')
ok(summary.typedInYear === 3, 'summary typed')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll club-monthly-year checks passed.')
