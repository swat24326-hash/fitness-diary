/**
 * node scripts/verify-club-sms-mode.mjs
 */
import { resolveClubSmsMode } from '../src/lib/admin/clubSmsModeCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolveClubSmsMode('expiring').mode === 'template', 'expiring → template')
ok(resolveClubSmsMode('expiring').scenario === 'expiring', 'expiring scenario')
ok(resolveClubSmsMode('birthdays').mode === 'template', 'birthdays → template')
ok(resolveClubSmsMode('expired_recent').mode === 'template', 'expired_recent → template')
ok(resolveClubSmsMode('stale').mode === 'template', 'stale → template')
ok(resolveClubSmsMode('all').mode === 'custom', 'all → custom')
ok(resolveClubSmsMode('none').mode === 'custom', 'none → custom')
ok(resolveClubSmsMode('inactive').mode === 'custom', 'inactive → custom')
ok(resolveClubSmsMode('active_today').mode === 'custom', 'active_today → custom')
ok(resolveClubSmsMode('expired_remaining').mode === 'custom', 'expired_remaining → custom (legacy url)')
ok(resolveClubSmsMode('').mode === 'custom', 'empty → custom')
ok(resolveClubSmsMode(null).scenario === null, 'null → no scenario')
ok(!resolveClubSmsMode('all').scenario, 'all has no scenario (no blind expiring)')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-club-sms-mode: all passed')
