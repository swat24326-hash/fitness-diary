/**
 * Самовосстановление подписки на уведомления: когда молча чинить, когда не трогать.
 * node scripts/verify-push-self-heal.mjs
 */
import { PUSH_HEAL_GAP_MS, pushHealDue, pushHealPlan } from '../src/lib/push/pushSelfHealCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const on = { supported: true, permission: 'granted', wantOn: true }
ok(pushHealPlan({ ...on, hasLocal: true, serverSubscribed: false }) === 'resend', 'iPhone сменил адрес / сервер удалил подписку — молча передаём подписку телефона')
ok(pushHealPlan({ ...on, hasLocal: false, serverSubscribed: false }) === 'resubscribe', 'подписка на телефоне пропала, разрешение есть — оформляем новую')
ok(pushHealPlan({ ...on, hasLocal: true, serverSubscribed: true }) === 'none', 'сервер знает адрес — ничего не делаем')
ok(pushHealPlan({ ...on, hasLocal: true }) === 'resend', 'приложение зала (сервер не спрашивали) — передаём подписку, повтор безопасен')
ok(pushHealPlan({ ...on, wantOn: false, hasLocal: true, serverSubscribed: false }) === 'none', 'человек сам выключил уведомления — обратно не включаем')
ok(pushHealPlan({ ...on, permission: 'default', hasLocal: false, serverSubscribed: false }) === 'none', 'разрешения нет — без касания не спрашиваем')
ok(pushHealPlan({ ...on, permission: 'denied', hasLocal: true, serverSubscribed: false }) === 'none', 'запретил в настройках — не трогаем')
ok(pushHealPlan({ ...on, supported: false, hasLocal: false, serverSubscribed: false }) === 'none', 'браузер без уведомлений (Safari во вкладке) — не трогаем')

const now = 10 * PUSH_HEAL_GAP_MS
ok(pushHealDue({ lastAt: 0, now }), 'ещё не проверяли — проверяем')
ok(pushHealDue({ lastAt: null, now }), 'нет отметки — проверяем')
ok(!pushHealDue({ lastAt: now - PUSH_HEAL_GAP_MS + 1000, now }), 'проверяли меньше получаса назад — не дёргаем сервер')
ok(pushHealDue({ lastAt: now - PUSH_HEAL_GAP_MS, now }), 'прошло полчаса — снова проверяем')

if (failed) {
  console.error(`\nverify-push-self-heal: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-push-self-heal: all passed')
