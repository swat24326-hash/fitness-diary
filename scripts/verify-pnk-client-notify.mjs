/**
 * node scripts/verify-pnk-client-notify.mjs
 */
import { buildPnkClientMessage } from '../src/lib/pnk/pnkClientNotifyCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const client = { name: 'Иванов Иван', phone: '+79001112233', pnk_trial_date: '2026-07-20', pnk_trial_time: '10:00' }

const invite = buildPnkClientMessage('invite', {
  client,
  trainerName: 'Петров',
  clubName: 'Format',
  trialDate: '2026-07-20',
  trialTime: '10:00',
})
ok(invite.includes('бесплатн') && invite.includes('Format') && invite.includes('10:00'), 'invite message')

const followup = buildPnkClientMessage('followup', { client, trainerName: 'Петров', clubName: 'Format' })
ok(followup.includes('абонемент') || followup.includes('оформи'), 'followup message')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-client-notify: all ok')
