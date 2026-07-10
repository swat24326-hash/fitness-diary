/**
 * node scripts/verify-draft-trainings-query.mjs
 */
import { isDraftTrainingRow } from '../src/lib/draftTrainingsQuery.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isDraftTrainingRow({ status: 'draft' }), 'draft row')
ok(!isDraftTrainingRow({ status: 'completed' }), 'completed not draft')
ok(!isDraftTrainingRow(null), 'null safe')

if (failed) process.exit(1)
console.log('verify-draft-trainings-query: all passed')
