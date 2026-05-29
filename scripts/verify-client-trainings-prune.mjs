/**
 * node scripts/verify-client-trainings-prune.mjs
 */
import { trainingIdsToPruneForClient } from '../src/lib/clientTrainingsPrune.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const clientId = 'c1'
const remote = [
  { id: 't1', client_id: clientId },
  { id: 't2', client_id: clientId },
]
const local = [
  { id: 't1', client_id: clientId },
  { id: 't2', client_id: clientId },
  { id: 'ghost', client_id: clientId },
  { id: 'other', client_id: 'c2' },
]

assert(
  trainingIdsToPruneForClient(clientId, local, remote, new Set()).join(',') === 'ghost',
  'prune local ghost not on server',
)
assert(
  trainingIdsToPruneForClient(clientId, local, remote, new Set(['ghost'])).length === 0,
  'keep ghost when pending insert in queue',
)
assert(
  trainingIdsToPruneForClient(clientId, local, remote, new Set(['t1'])).join(',') === 'ghost',
  'pending on server row does not block other ghosts',
)
assert(trainingIdsToPruneForClient('', local, remote, new Set()).length === 0, 'empty client id')
assert(
  trainingIdsToPruneForClient('c2', local, [{ id: 'x', client_id: 'c2' }], new Set()).join(',') === 'other',
  'prune only for requested client',
)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll client trainings prune checks passed.')
