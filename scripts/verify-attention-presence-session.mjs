/**
 * node scripts/verify-attention-presence-session.mjs
 */
import { mergeAttentionPresencePayload } from '../src/lib/admin/attentionPresenceSession.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const afterSales = mergeAttentionPresencePayload(null, {
  hasPnk: true,
  hasPlanerka: false,
  hasCallToday: true,
  touchCallToday: true,
})
ok(afterSales.hasCallToday === true, 'sales writes call today')

const afterAdmin = mergeAttentionPresencePayload(afterSales, {
  hasPnk: true,
  hasPlanerka: true,
  hasCallToday: false,
  touchCallToday: false,
})
ok(afterAdmin.hasCallToday === true, 'admin without touch keeps call today')
ok(afterAdmin.hasPlanerka === true, 'admin updates planerka')

const cleared = mergeAttentionPresencePayload(afterAdmin, {
  hasPnk: false,
  hasPlanerka: false,
  hasCallToday: false,
  touchCallToday: true,
})
ok(cleared.hasCallToday === false, 'touch can clear call today')

if (failed) process.exit(1)
console.log('verify-attention-presence-session: all passed')
