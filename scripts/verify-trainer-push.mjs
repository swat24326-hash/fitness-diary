/**
 * node scripts/verify-trainer-push.mjs
 */
import {
  buildDispatchPushPayload,
  formatPushSubscribeError,
  isValidVapidPublicKey,
  normalizePushSubscribePayload,
  normalizePushUnsubscribePayload,
  normalizeVapidPublicKey,
} from '../src/lib/push/trainerPushCore.js'
import { sortActiveDispatchTasks } from '../src/lib/admin/iskraDispatchInboxActionsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const sub = normalizePushSubscribePayload({
  endpoint: 'https://push.example/sub/1',
  p256dh: 'abc',
  auth: 'def',
  club_id: 'c1',
})
ok(sub.ok && sub.payload.endpoint.includes('push.example'), 'normalize subscribe')

const unsub = normalizePushUnsubscribePayload({ endpoint: 'https://push.example/sub/1' })
ok(unsub.ok && unsub.endpoint, 'normalize unsubscribe')

const payload = buildDispatchPushPayload({ title: 'Тест', body: 'Тело', url: '/trainer?inbox=1' })
ok(payload.title === 'Тест' && payload.url.includes('inbox'), 'build push payload')

const sorted = sortActiveDispatchTasks([
  { status: 'accepted', priority: 'normal' },
  { status: 'pending', priority: 'normal' },
])
ok(sorted[0]?.status === 'pending', 'sort active for swipe')

const sampleVapid =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
ok(isValidVapidPublicKey(sampleVapid), 'valid vapid sample')
ok(!isValidVapidPublicKey('short'), 'reject short vapid')
ok(normalizeVapidPublicKey('  "abc"  ') === 'abc', 'normalize vapid trim')

const edgeErr = formatPushSubscribeError(new Error('Registration failed - push service error'), {
  isEdge: true,
})
ok(edgeErr.includes('Edge') && edgeErr.includes('Windows'), 'edge push error ru')

if (failed) process.exit(1)
console.log('verify-trainer-push: all ok')
