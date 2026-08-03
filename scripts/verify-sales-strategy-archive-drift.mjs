import {
  candidateLostDkRub,
  findArchivedEndingBackgroundRisk,
  findArchivedRenewalDrift,
  isClientArchivedForDrift,
} from '../src/lib/admin/salesStrategyArchiveDriftCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isClientArchivedForDrift({ archived_at: '2026-07-01' }), 'archived_at')
ok(isClientArchivedForDrift({ lifecycle: 'archived' }), 'lifecycle archived')
ok(!isClientArchivedForDrift({ id: '1', name: 'Active' }), 'active not archived')

ok(candidateLostDkRub({ avgRub: 10000 }, 50) === 5000, 'lost dk = avg × %')

const drift = findArchivedRenewalDrift({
  renewalPct: 80,
  previousCandidates: [
    {
      clientId: 'a',
      clientName: 'Анна',
      hall: 'pz',
      endDate: '2026-08-10',
      avgRub: 10000,
    },
    {
      clientId: 'b',
      clientName: 'Борис',
      hall: 'tz',
      endDate: '2026-08-12',
      avgRub: 8000,
    },
    {
      clientId: 'c',
      clientName: 'Живой',
      hall: 'pz',
      endDate: '2026-08-15',
      avgRub: 9000,
    },
  ],
  clients: [
    { id: 'a', archived_at: '2026-08-02', name: 'Анна' },
    { id: 'b', lifecycle: 'archive', name: 'Борис' },
    { id: 'c', name: 'Живой' },
  ],
})
ok(drift.ok && drift.count === 2, 'two archived from snapshot')
ok(drift.tone === 'warn', 'warn tone for snapshot drift')
ok(Math.abs(drift.lostDkRub - (8000 + 6400)) < 1, 'lost dk sum')
ok(drift.suggestUkRub === drift.lostDkRub, 'suggest UK = lost DK')
ok(drift.archiveExcludedFromRenewals === true, 'confirm archive excluded')
ok(drift.rows.every((r) => r.clientId !== 'c'), 'active candidate not in drift')

const empty = findArchivedRenewalDrift({
  previousCandidates: [{ clientId: 'x', avgRub: 1 }],
  clients: [{ id: 'x', name: 'Still active' }],
  renewalPct: 50,
})
ok(!empty.ok && empty.count === 0, 'no drift when none archived')

const bg = findArchivedEndingBackgroundRisk({
  year: 2026,
  month: 8,
  clients: [
    { id: 'z', archived_at: '2026-08-01', name: 'Ушёл', trainer_id: 't1' },
    { id: 'y', archived_at: '2026-08-01', name: 'Другой месяц', trainer_id: 't1' },
  ],
  memberships: [
    { client_id: 'z', end_date: '2026-08-20' },
    { client_id: 'y', end_date: '2026-07-01' },
  ],
})
ok(bg.ok && bg.count === 1 && bg.tone === 'info', 'background risk one ending in month')
ok(bg.rows[0].clientId === 'z', 'background row is z')

if (failed) {
  console.error(`\n${failed} archive drift check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales strategy archive drift checks passed')
