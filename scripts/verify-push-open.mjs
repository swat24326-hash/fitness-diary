/**
 * Нажали на push при открытом приложении: какое окно и что сделать (открыть диалог / Планёрку поверх экрана).
 * node scripts/verify-push-open.mjs
 */
import { readFileSync } from 'node:fs'
import { pushAppOfPath, pushOpenAction } from '../src/lib/push/pushOpenCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(pushAppOfPath('/me/chat/trainer') === 'client', '/me — приложение клиента')
ok(pushAppOfPath('/coach/dm/u1') === 'coach', '/coach — телефон тренера')
ok(pushAppOfPath('/messages/dm/u1') === 'staff', '/messages — приложение зала')
ok(pushAppOfPath('/mentor') === 'staff' && pushAppOfPath('/coaching') === 'staff', 'похожие пути — не путаем с /me и /coach')

const go = (url, current) => pushOpenAction(url, current)
ok(go('/coach/dm/u1', '/coach/schedule')?.to === '/coach/dm/u1', 'тренер в Ежедневнике — открыть диалог')
ok(go('/me/chat/trainer', '/me')?.to === '/me/chat/trainer', 'клиент на главной — открыть диалог')
ok(go('/messages/chat/c1/trainer', '/trainer/training/t1')?.kind === 'navigate', 'планшет: push переписки — в диалог')
ok(go('/trainer?inbox=1', '/trainer/training/t1')?.kind === 'inbox', 'задание Планёрки — окно поверх, с тренировки не уводим')
ok(go('/coach/dm/u1', '/coach/dm/u1') === null, 'уже в этом диалоге — ничего не делаем')
ok(go('https://evil.example/x', '/coach') === null, 'чужой адрес — игнор')
ok(go('//evil.example/x', '/coach') === null, 'адрес без схемы на чужой сайт — игнор')
ok(go(undefined, '/coach') === null, 'нет адреса — игнор')

const sw = readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8')
ok(sw.includes("type: 'push-open'"), 'service worker шлёт окну push-open')
ok(!sw.includes('open-trainer-inbox'), 'старый сигнал «открыть Планёрку на любой push» убран')
for (const p of ['/me', '/me/chat/trainer', '/coach', '/coach/dm/u1', '/messages', '/trainer']) {
  const m = sw.match(/function appOfPath\(path\) \{([\s\S]*?)\n\}/)
  const appOfPath = new Function('path', m[1])
  ok(appOfPath(p) === pushAppOfPath(p), `копия в service worker совпадает с приложением: ${p}`)
}

console.log('verify-push-open: all passed')
