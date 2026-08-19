/**
 * client_restore_events — verify.
 *
 * node scripts/verify-client-restore-event.mjs
 */
import {
  buildClientRestoreEventInsertRow,
  detectClientRestoreEvent,
} from '../src/lib/admin/clientRestoreEventCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(
  detectClientRestoreEvent(
    { id: 'c1', club_id: 'club1', archived_at: '2026-07-01' },
    { archived_at: null },
  )?.clientId === 'c1',
  'detect restore',
)
ok(
  detectClientRestoreEvent({ id: 'c1', archived_at: null }, { archived_at: null }) === null,
  'not restore when never archived',
)
ok(
  detectClientRestoreEvent(
    { id: 'c1', club_id: 'club1', archived_at: '2026-07-01', archive_reason: 'Не ходит' },
    { archived_at: null },
  )?.priorArchiveReason === 'Не ходит',
  'prior reason captured',
)

const row = buildClientRestoreEventInsertRow({
  clubId: 'club1',
  clientId: 'c1',
  trainerId: 't1',
  priorArchivedAt: '2026-07-01T00:00:00Z',
  priorArchiveReason: 'test',
  restoredBy: 'u1',
})
ok(row.club_id === 'club1' && row.client_id === 'c1' && row.source === 'push', 'insert row shape')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll client-restore-event checks passed.')
