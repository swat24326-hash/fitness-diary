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

ok(CLIENT_HARD_DELETE_CONFIRM_CODE === '0000', 'code constant')
ok(isClientHardDeleteConfirmCode('0000'), 'exact')
ok(isClientHardDeleteConfirmCode(' 0000 '), 'trim')
ok(!isClientHardDeleteConfirmCode('000'), 'too short')
ok(!isClientHardDeleteConfirmCode('0001'), 'wrong')
ok(!isClientHardDeleteConfirmCode(''), 'empty')

if (failed) process.exit(1)
console.log('verify-client-hard-delete-confirm: all ok')
