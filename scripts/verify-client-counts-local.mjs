/**
 * node scripts/verify-client-counts-local.mjs
 */
import { aggregateClientCountsByTrainer } from '../src/lib/clientCountsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  { id: '1', trainer_id: 't1' },
  { id: '2', trainer_id: 't1' },
  { id: '3', trainer_id: 't2' },
  { id: '4', trainer_id: null },
]
const counts = aggregateClientCountsByTrainer(rows)
ok(counts.t1 === 2, 'two clients for t1')
ok(counts.t2 === 1, 'one client for t2')
ok(counts.t3 == null, 'no empty trainer key')

if (failed) process.exit(1)
console.log('verify-client-counts-local: all passed')
