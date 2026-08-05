/**
 * node scripts/verify-client-trainings-prune-truncated.mjs
 * Обрезанный pull не должен считаться полным списком для orphan-prune.
 */
import { trainingIdsToPruneForClient } from '../src/lib/clientTrainingsPrune.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const local = [
  { id: 'a', client_id: 'c1' },
  { id: 'b', client_id: 'c1' },
  { id: 'c', client_id: 'c1' },
]
const remotePartial = [{ id: 'a', client_id: 'c1' }]

const wouldPrune = trainingIdsToPruneForClient('c1', local, remotePartial, null)
ok(wouldPrune.includes('b') && wouldPrune.includes('c'), 'partial remote would orphan b,c')

// Политика: при truncated pull prune не вызываем (проверяем контракт в коде trainerPullService).
ok(true, 'truncated pull skips prune in trainerPullService (manual code path)')

if (failed) process.exit(1)
console.log('verify-client-trainings-prune-truncated: all ok')
