/**
 * node scripts/verify-pnk-coach-notify.mjs
 */
import {
  buildPnkCoachNotifyMessage,
  resolvePnkCoachNotifyKind,
} from '../src/lib/pnk/pnkCoachNotifyCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const base = {
  name: 'Иванов',
  phone: '+79001112233',
  pnk_stage: 'assigned',
  pnk_deliverables: {},
}

ok(resolvePnkCoachNotifyKind(base) === 'call', 'kind call when no contact')
ok(resolvePnkCoachNotifyKind({ ...base, pnk_trial_date: '2026-07-20', pnk_stage: 'agreed' }) === 'agreed', 'kind agreed')
ok(
  resolvePnkCoachNotifyKind({
    ...base,
    pnk_stage: 'trial_done',
    pnk_deliverables: { trial: 'x', nutrition: null, homework: null },
  }) === 'package',
  'kind package',
)

const msg = buildPnkCoachNotifyMessage('created', {
  client: base,
  trainerName: 'Петров',
  managerName: 'Менеджер',
  clubName: 'Format',
})
ok(msg.includes('Иванов') && msg.includes('Петров') && msg.includes('Format'), 'created message')
ok(msg.includes('79001112233') || msg.includes('+79001112233') || msg.includes('Тел'), 'phone in message')

const agreed = buildPnkCoachNotifyMessage('agreed', {
  client: { ...base, pnk_trial_date: '2026-07-20', pnk_trial_time: '10:00' },
  trainerName: 'Петров',
})
ok(agreed.includes('пробная согласована') && agreed.includes('10:00'), 'agreed message has date/time')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-coach-notify: all ok')
