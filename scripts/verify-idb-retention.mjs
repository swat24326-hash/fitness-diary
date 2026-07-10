/**
 * node scripts/verify-idb-retention.mjs
 */
import {
  LOCAL_TRAININGS_RETENTION_DAYS,
  retentionCutoffIso,
  shouldPruneTrainingRow,
  trainingDateForRetention,
} from '../src/lib/idbRetentionCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(LOCAL_TRAININGS_RETENTION_DAYS >= 90, 'retention days >= pull window')
ok(/^\d{4}-\d{2}-\d{2}$/.test(retentionCutoffIso(30)), 'cutoff iso format')
ok(trainingDateForRetention({ date: '2026-01-01' }) === '2026-01-01', 'date field')

const pending = new Set(['t1'])
const cutoff = '2026-01-01'
ok(shouldPruneTrainingRow({ id: 't1', status: 'completed', date: '2025-12-01' }, cutoff, pending) === false, 'pending skip')
ok(shouldPruneTrainingRow({ id: 't2', status: 'draft', date: '2025-12-01' }, cutoff, pending) === false, 'draft skip')
ok(shouldPruneTrainingRow({ id: 't3', status: 'completed', date: '2025-12-01' }, cutoff, pending) === true, 'old completed prune')
ok(shouldPruneTrainingRow({ id: 't4', status: 'completed', date: '2026-02-01' }, cutoff, pending) === false, 'recent keep')

if (failed) process.exit(1)
console.log('verify-idb-retention: all passed')
