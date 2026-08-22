/**
 * node scripts/verify-pnk-bz-completed.mjs
 */
import {
  PNK_BZ_COMPLETED_CAP,
  buildPnkBzCompletedByClientId,
  countPnkBzCompletedFromTrainings,
  normalizePnkBzCompletedCount,
  peekPnkBzCompletedCount,
} from '../src/lib/pnk/pnkBzCompletedCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(PNK_BZ_COMPLETED_CAP === 2, 'cap 2')
ok(normalizePnkBzCompletedCount(0) === 0, 'norm 0')
ok(normalizePnkBzCompletedCount(1) === 1, 'norm 1')
ok(normalizePnkBzCompletedCount(5) === 2, 'norm cap')
ok(normalizePnkBzCompletedCount(-1) === 0, 'norm floor')
ok(normalizePnkBzCompletedCount('x') === 0, 'norm junk')

ok(countPnkBzCompletedFromTrainings([]) === 0, 'empty trainings')
ok(
  countPnkBzCompletedFromTrainings([
    { status: 'completed' },
    { status: 'draft' },
    { status: 'completed' },
    { status: 'completed' },
  ]) === 2,
  'three completed → cap 2',
)

ok(
  countPnkBzCompletedFromTrainings(
    [
      { status: 'completed', date: '2026-06-01' },
      { status: 'completed', date: '2026-07-10' },
      { status: 'completed', date: '2026-07-20' },
    ],
    { sinceIso: '2026-07-01' },
  ) === 2,
  'sinceIso ignores pre-PNK completed',
)

ok(
  countPnkBzCompletedFromTrainings(
    [{ status: 'completed', date: '2026-06-15' }],
    { sinceIso: '2026-07-01' },
  ) === 0,
  'sinceIso all before → 0',
)

const map = buildPnkBzCompletedByClientId([
  { client_id: 'a', status: 'completed' },
  { client_id: 'a', status: 'completed' },
  { client_id: 'a', status: 'completed' },
  { client_id: 'b', status: 'draft' },
  { client_id: 'b', status: 'completed' },
  { client_id: '', status: 'completed' },
])
ok(map.a === 2 && map.b === 1, 'by client map')

const mapSince = buildPnkBzCompletedByClientId(
  [
    { client_id: 'a', status: 'completed', date: '2026-01-01' },
    { client_id: 'a', status: 'completed', date: '2026-08-01' },
    { client_id: 'b', status: 'completed', date: '2026-08-01' },
  ],
  { sinceByClientId: { a: '2026-07-01' }, sinceIso: '2026-07-01' },
)
ok(mapSince.a === 1 && mapSince.b === 1, 'by client since map')
ok(peekPnkBzCompletedCount(map, 'a') === 2, 'peek a')
ok(peekPnkBzCompletedCount(map, 'missing') === 0, 'peek missing')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll ok')
