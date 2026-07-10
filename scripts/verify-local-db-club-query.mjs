/**
 * node scripts/verify-local-db-club-query.mjs
 */
import {
  applyTrainingJournalFilters,
  filterRowsByClubId,
  normalizeClubId,
  sliceTrainingJournalPage,
  sortTrainingsByDateDesc,
  trainingMatchesJournalFilters,
} from '../src/lib/localDbClubQuery.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClubId('  abc ') === 'abc', 'normalize club id')
ok(normalizeClubId(null) === '', 'empty club id')

const rows = [
  { id: '1', club_id: 'c1' },
  { id: '2', club_id: 'c2' },
  { id: '3', club_id: 'c1' },
]
const c1 = filterRowsByClubId(rows, 'c1')
ok(c1.length === 2, 'filter by club')
ok(filterRowsByClubId(rows, '').length === 0, 'filter empty club')

const trainings = [
  { id: 'a', club_id: 'c1', trainer_id: 't1', client_id: 'cl1', date: '2026-06-10', status: 'done' },
  { id: 'b', club_id: 'c1', trainer_id: 't2', client_id: 'cl2', date: '2026-06-05', status: 'planned' },
  { id: 'c', club_id: 'c2', trainer_id: 't1', client_id: 'cl3', date: '2026-06-08', status: 'done' },
]
const f = { clubId: 'c1', trainerId: 't1', dateFrom: '2026-06-01', dateTo: '2026-06-30', status: 'done' }
ok(trainingMatchesJournalFilters(trainings[0], f), 'training matches filters')
ok(!trainingMatchesJournalFilters(trainings[1], f), 'training fails status')
ok(applyTrainingJournalFilters(trainings, f).length === 1, 'apply journal filters')

const sorted = sortTrainingsByDateDesc(trainings)
ok(sorted[0].id === 'a', 'sort by date desc')
const page = sliceTrainingJournalPage(sorted, 0, 2)
ok(page.length === 2, 'slice page')

if (failed) process.exit(1)
console.log('verify-local-db-club-query: all passed')
