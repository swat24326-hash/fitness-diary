/**
 * Шторка push: своё приложение на экране — без дубля; гасим только своё при входе.
 * node scripts/verify-push-shade.mjs
 */
import { readFileSync } from 'node:fs'
import {
  pushShadeBelongsToApp,
  pushShadeNotificationApp,
  pushShouldShowShade,
} from '../src/lib/push/pushShadeCore.js'
import { clearPushShadeForApp } from '../src/lib/push/pushShadeClear.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(pushShadeNotificationApp('/me/chat/trainer') === 'client', 'url клиента')
ok(pushShadeNotificationApp('/coach/dm/u1') === 'coach', 'url тренера')
ok(pushShadeNotificationApp('/messages/chat/c1/trainer') === 'staff', 'url зала')
ok(pushShadeNotificationApp('/trainer?inbox=1') === 'staff', 'планёрка — зал')

ok(pushShouldShowShade({ notificationApp: 'client', focusedApps: [] }), 'фона нет — показать')
ok(
  !pushShouldShowShade({ notificationApp: 'client', focusedApps: ['client'] }),
  'клиент уже на экране — не дублировать шторку',
)
ok(
  pushShouldShowShade({ notificationApp: 'client', focusedApps: ['staff'] }),
  'открыт зал — push клиента всё равно в шторку',
)

ok(pushShadeBelongsToApp('client', 'client'), 'гасим своё')
ok(!pushShadeBelongsToApp('client', 'staff'), 'чужое приложение не трогаем')

const closed = await clearPushShadeForApp('client', {
  getRegistration: async () => ({
    getNotifications: async () => [
      { data: { url: '/me/chat/trainer' }, close: () => {} },
      { data: { url: '/trainer?inbox=1' }, close: () => {} },
      { data: { url: '/coach/dm/1' }, close: () => {} },
    ],
  }),
})
ok(closed === 1, 'clear закрывает только client')

const sw = readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8')
ok(sw.includes('focusedSame'), 'SW не дублирует плашку, если окно в фокусе')
ok(sw.includes("type: 'push-received'"), 'сигнал в открытое окно остаётся')
ok(sw.includes('/icons/push-192.png') && !sw.includes("icon: '/icons/icon-192.png'"), 'icon push — непрозрачный push-192, не splash')
ok(sw.includes('/icons/badge-96.png'), 'badge в строке состояния')

console.log('verify-push-shade: all passed')
