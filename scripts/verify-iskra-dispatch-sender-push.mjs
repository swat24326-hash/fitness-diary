/**
 * node scripts/verify-iskra-dispatch-sender-push.mjs
 */
import {
  buildDispatchSenderStatusPushPayload,
  shouldNotifySenderOnDispatchStatus,
  shouldSkipSenderPush,
  shortenDispatchTitleForPush,
} from '../src/lib/admin/iskraDispatchSenderPushCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(shouldNotifySenderOnDispatchStatus('accepted'), 'accepted notifies sender')
ok(shouldNotifySenderOnDispatchStatus('done'), 'done notifies sender')
ok(!shouldNotifySenderOnDispatchStatus('seen'), 'seen does not notify')
ok(!shouldNotifySenderOnDispatchStatus('pending'), 'pending does not notify')

ok(shortenDispatchTitleForPush('x'.repeat(80)).length <= 72, 'title shortened')

const accepted = buildDispatchSenderStatusPushPayload({
  status: 'accepted',
  dispatchId: 'd1',
  clubId: 'club-1',
  taskTitle: 'Позвонить клиенту',
  recipientName: 'Иван',
})
ok(accepted?.title === 'Задание принято', 'accepted title')
ok(accepted?.body?.includes('Иван') && accepted.body.includes('принял'), 'accepted body')
ok(accepted?.url === '/admin/club-tasks?club=club-1', 'accepted url')
ok(accepted?.tag === 'dispatch-sender-d1-accepted', 'accepted tag')

const done = buildDispatchSenderStatusPushPayload({
  status: 'done',
  dispatchId: 'd2',
  clubId: '',
  taskTitle: 'Отчёт',
  recipientName: 'Мария',
})
ok(done?.title === 'Задание выполнено', 'done title')
ok(done?.body?.includes('выполнил'), 'done body')
ok(done?.url === '/admin/club-tasks', 'done url without club')

ok(shouldSkipSenderPush('', 'u1'), 'skip without sender')
ok(shouldSkipSenderPush('u1', 'u1'), 'skip self-assign')
ok(!shouldSkipSenderPush('owner', 'trainer'), 'notify distinct users')

if (failed) process.exit(1)
console.log('verify-iskra-dispatch-sender-push: all ok')
