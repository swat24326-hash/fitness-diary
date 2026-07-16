/**
 * node scripts/verify-sales-client-segment.mjs
 */
import {
  SALE_RETURNING_GAP_DAYS,
  classifySaleClientSegment,
  saleSegmentToProfitBucket,
} from '../src/lib/admin/salesClientSegmentCore.js'
import { STALE_TRAINING_DAYS } from '../src/lib/trainer/trainerClientOutreachCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(SALE_RETURNING_GAP_DAYS === STALE_TRAINING_DAYS, 'gap = trainer stale days')

const saleDate = '2026-07-15'

const nk = classifySaleClientSegment({
  saleDate,
  clientId: 'c1',
  memList: [],
  trainings: [],
})
ok(nk.segment === 'nk', 'NK never trained, no membership')

const dk = classifySaleClientSegment({
  saleDate,
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 12, used_trainings: 0 }],
  trainings: [],
})
ok(dk.segment === 'dk', 'DK when membership valid')

const uk1Day0 = classifySaleClientSegment({
  saleDate: '2026-07-10',
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 10, used_trainings: 10 }],
  trainings: [{ status: 'completed', date: '2026-07-01', client_id: 'c1' }],
})
ok(uk1Day0.segment === 'uk1' && uk1Day0.daysSinceEnd === 0, 'UK1 day 0 after end (hot)')

const uk1Day13 = classifySaleClientSegment({
  saleDate: '2026-07-15',
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-07-02', total_trainings: 10, used_trainings: 10 }],
  trainings: [],
})
ok(uk1Day13.segment === 'uk1' && uk1Day13.daysSinceEnd === 13, 'UK1 day 13 after end (hot)')

const uk2Day14 = classifySaleClientSegment({
  saleDate: '2026-07-15',
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-07-01', total_trainings: 10, used_trainings: 10 }],
  trainings: [],
})
ok(uk2Day14.segment === 'uk2' && uk2Day14.daysSinceEnd === 14, 'UK2 at exactly 14 days (cold)')

const uk2Long = classifySaleClientSegment({
  saleDate: '2026-07-15',
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-06-01', total_trainings: 8, used_trainings: 0 }],
  trainings: [],
})
ok(uk2Long.segment === 'uk2', 'UK2 long gap')

ok(saleSegmentToProfitBucket('uk1') === 'uk', 'uk1 → profit uk')
ok(saleSegmentToProfitBucket('uk2') === 'uk', 'uk2 → profit uk')
ok(saleSegmentToProfitBucket('nk') === 'nk', 'nk → profit nk')

// нет разрыва ДК→УК: сразу после конца уже УК1, не ДК
const notDkAfterEnd = classifySaleClientSegment({
  saleDate: '2026-07-11',
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 10, used_trainings: 5 }],
  trainings: [{ status: 'completed', date: '2026-07-01', client_id: 'c1' }],
})
ok(notDkAfterEnd.segment === 'uk1', 'after end is UK1 not DK')

if (failed) process.exit(1)
console.log('verify-sales-client-segment: all passed')
