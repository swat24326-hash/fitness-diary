/**
 * Фильтр персонала по клубу из шапки (?club=).
 * node scripts/verify-filter-staff-by-club.mjs
 */
import {
  clubsForStaffSections,
  filterStaffByClub,
  normalizeClubFilterId,
  shouldShowUnassignedStaff,
} from '../src/lib/admin/filterStaffByClub.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClubFilterId('  abc  ') === 'abc', 'normalize trims')
ok(normalizeClubFilterId(null) === '', 'normalize null → empty')
ok(normalizeClubFilterId(undefined) === '', 'normalize undefined → empty')

const staff = [
  { id: '1', club_id: 'club-a', name: 'A' },
  { id: '2', club_id: 'club-b', name: 'B' },
  { id: '3', club_id: null, name: 'None' },
  { id: '4', club_id: '  club-a  ', name: 'A2' },
]

const all = filterStaffByClub(staff, '')
ok(all.length === 4, 'empty club → all rows')

const onlyA = filterStaffByClub(staff, 'club-a')
ok(
  onlyA.map((r) => r.id).sort().join(',') === '1,4',
  'filter by club-a trims row club_id',
)
ok(filterStaffByClub(staff, 'club-b').map((r) => r.id).join(',') === '2', 'filter by club-b')
ok(filterStaffByClub(staff, 'missing').length === 0, 'unknown club → empty')
ok(filterStaffByClub(null, 'club-a').length === 0, 'null rows → []')

ok(shouldShowUnassignedStaff(''), 'show unassigned when no club')
ok(shouldShowUnassignedStaff('club-a') === false, 'hide unassigned when club set')

const clubs = [
  { id: 'club-a', name: 'A' },
  { id: 'club-b', name: 'B' },
]
ok(clubsForStaffSections(clubs, '').length === 2, 'sections: all clubs when empty')
ok(clubsForStaffSections(clubs, 'club-b').map((c) => c.id).join(',') === 'club-b', 'sections: only selected')
ok(clubsForStaffSections(clubs, 'missing').length === 0, 'sections: unknown club → []')

if (failed) process.exit(1)
console.log('verify-filter-staff-by-club: all passed')
