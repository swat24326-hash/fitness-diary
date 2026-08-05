/**
 * node scripts/verify-desk-client-birth-form.mjs
 */
import { mergeDeskClientBirthForm } from '../src/lib/admin/deskClientBirthFormCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(
  mergeDeskClientBirthForm({
    fromClientBirth: '1989-03-12',
    prevBirth: '',
    switched: true,
    birthDirty: true,
  }) === '1989-03-12',
  'switch takes client',
)

ok(
  mergeDeskClientBirthForm({
    fromClientBirth: '1989-03-12',
    prevBirth: '',
    switched: false,
    birthDirty: true,
  }) === '',
  'dirty clear kept against hydrate',
)

ok(
  mergeDeskClientBirthForm({
    fromClientBirth: '1989-03-12',
    prevBirth: '1990-01-01',
    switched: false,
    birthDirty: true,
  }) === '1990-01-01',
  'dirty edit kept',
)

ok(
  mergeDeskClientBirthForm({
    fromClientBirth: '1989-03-12',
    prevBirth: '',
    switched: false,
    birthDirty: false,
  }) === '1989-03-12',
  'clean takes client',
)

ok(
  mergeDeskClientBirthForm({
    fromClientBirth: '',
    prevBirth: '1989-03-12',
    switched: false,
    birthDirty: false,
  }) === '',
  'clean empty client clears form',
)

if (failed) process.exit(1)
console.log('verify-desk-client-birth-form: all ok')
