/**
 * node scripts/verify-trainer-journal-filter.mjs
 */
import { filterCompletedTrainingsInDateRange } from '../src/lib/trainer/trainerJournalFilterCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  { id: '1', status: 'completed', date: '2026-08-03' },
  { id: '2', status: 'draft', date: '2026-08-03' },
  { id: '3', status: 'completed', date: '2026-08-04' },
  { id: '4', status: 'completed', date: '2026-08-02' },
]

const mon = filterCompletedTrainingsInDateRange(rows, '2026-08-03', '2026-08-03')
ok(mon.length === 1 && mon[0].id === '1', 'monday only completed')
ok(filterCompletedTrainingsInDateRange(rows, '2026-08-03', '2026-08-04').length === 2, 'two days')
ok(filterCompletedTrainingsInDateRange(rows, '2026-08-05', '2026-08-05').length === 0, 'empty day')
ok(filterCompletedTrainingsInDateRange(null, '2026-08-03', '2026-08-03').length === 0, 'null safe')
ok(filterCompletedTrainingsInDateRange(rows, 'bad', '2026-08-03').length === 0, 'bad from')

if (failed) process.exit(1)
console.log('verify-trainer-journal-filter: all ok')
