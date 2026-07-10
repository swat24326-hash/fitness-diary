/**
 * node scripts/verify-club-monthly-years-bounds.mjs
 */
import {
  discoverMonthlyChartYears,
  discoverMonthlyChartYearsFromBounds,
} from '../api/_lib/clubMonthlyAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const trainings = [
  { date: '2022-03-01', status: 'completed' },
  { date: '2024-11-01', status: 'completed' },
  { date: '2024-12-01', status: 'planned' },
]

const fromRows = discoverMonthlyChartYears(trainings, { anchorYear: 2024 })
const fromBounds = discoverMonthlyChartYearsFromBounds({ minYear: 2022, maxYear: 2024, anchorYear: 2024 })

ok(fromRows.includes(2022), 'rows include 2022')
ok(fromBounds.includes(2022), 'bounds include 2022')
ok(fromBounds[0] >= 2024, 'bounds max year first')
ok(JSON.stringify(fromRows) === JSON.stringify(fromBounds), 'bounds parity with rows scan')

const empty = discoverMonthlyChartYearsFromBounds({ anchorYear: 2023 })
ok(Array.isArray(empty) && empty.length >= 1, 'empty bounds fallback')

if (failed) process.exit(1)
console.log('verify-club-monthly-years-bounds: all passed')
