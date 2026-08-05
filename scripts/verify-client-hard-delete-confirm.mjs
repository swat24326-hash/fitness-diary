/**
 * node scripts/verify-client-hard-delete-confirm.mjs
 */
import {
  CLIENT_HARD_DELETE_CONFIRM_CODE,
  isClientHardDeleteConfirmCode,
} from '../src/lib/clientHardDeleteConfirmCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(CLIENT_HARD_DELETE_CONFIRM_CODE === '124578', 'code constant')
ok(isClientHardDeleteConfirmCode('124578'), 'exact')
ok(isClientHardDeleteConfirmCode(' 124578 '), 'trim')
ok(!isClientHardDeleteConfirmCode('12457'), 'too short')
ok(!isClientHardDeleteConfirmCode('0000'), 'old code')
ok(!isClientHardDeleteConfirmCode(''), 'empty')

if (failed) process.exit(1)
console.log('verify-client-hard-delete-confirm: all ok')
