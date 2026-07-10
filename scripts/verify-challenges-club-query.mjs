/**
 * node scripts/verify-challenges-club-query.mjs
 */
import {
  filterChallengesByClubIds,
  mergeChallengeLists,
  sortChallengesByCreatedDesc,
} from '../src/lib/challengesClubQuery.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  { id: 'a', club_id: 'c1', created_at: '2026-01-01' },
  { id: 'b', club_id: 'c2', created_at: '2026-06-01' },
  { id: 'c', club_id: 'c1', created_at: '2026-03-01' },
]

ok(filterChallengesByClubIds(rows, ['c1']).length === 2, 'filter by one club')
ok(filterChallengesByClubIds(rows, ['c1', 'c2']).length === 3, 'filter by two clubs')
ok(filterChallengesByClubIds(rows, []).length === 0, 'empty club ids')

const sorted = sortChallengesByCreatedDesc(rows)
ok(sorted[0].id === 'b', 'sort by created desc')

const merged = mergeChallengeLists([
  [{ id: 'x', club_id: 'c1', created_at: '2026-02-01' }],
  [{ id: 'x', club_id: 'c1', created_at: '2026-02-01' }, { id: 'y', club_id: 'c2', created_at: '2026-05-01' }],
])
ok(merged.length === 2, 'merge dedupes by id')
ok(merged[0].id === 'y', 'merge sorts desc')

if (failed) process.exit(1)
console.log('verify-challenges-club-query: all passed')
