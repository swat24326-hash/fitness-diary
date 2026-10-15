/**
 * Плашка «Нет сети / Соединение…» приложения клиента и телефона тренера: состояния, задержка против мигания,
 * подключение в оболочки, данные на экране не пропадают при ошибке сети (status 'stale').
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NET_BAR_DELAY_MS, NET_BAR_TEXT_RU, netStatusBarShown, netStatusBarState } from '../src/lib/net/netStatusBarCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

console.log('состояние')
ok(netStatusBarState({ browserOnline: false, cloudConfirmed: true }) === 'offline', 'нет интернета — «Нет сети»')
ok(netStatusBarState({ browserOnline: false, cloudConfirmed: false }) === 'offline', 'нет интернета важнее сервера')
ok(netStatusBarState({ browserOnline: true, cloudConfirmed: false }) === 'connecting', 'интернет есть, сервер не ответил — «Соединение…»')
ok(netStatusBarState({ browserOnline: true, cloudConfirmed: true }) === 'hidden', 'всё хорошо — плашки нет')

console.log('мигание')
ok(!netStatusBarShown('offline', 1000, 1000 + NET_BAR_DELAY_MS - 1), 'короткий сбой не показываем')
ok(netStatusBarShown('offline', 1000, 1000 + NET_BAR_DELAY_MS), 'дольше задержки — показываем')
ok(!netStatusBarShown('hidden', 0, 1e9), 'хорошее — сразу без плашки')
ok(/сохранённое/.test(NET_BAR_TEXT_RU.offline) && NET_BAR_TEXT_RU.connecting === 'Соединение…', 'тексты по-русски, как в Telegram')

console.log('wiring')
ok(/<NetStatusBar \/>/.test(src('src/pages/coach/CoachShell.jsx')), 'телефон тренера: плашка в оболочке')
ok(/<NetStatusBar \/>/.test(src('src/pages/client/ClientMeShell.jsx')), 'клиент: плашка в оболочке')
ok(/position: fixed/.test(src('src/styles/net-status.css')) && /pointer-events: none/.test(src('src/styles/net-status.css')), 'плашка парит: вёрстку и касания не трогает')
ok(/isCloudConfirmed/.test(src('src/hooks/useNetStatusBar.js')), '«Соединение…» — по настоящему ответу сервера, без 45-секундной поблажки')
ok(/status: s\.data \? 'stale' : 'error'/.test(src('src/pages/coach/useCoachLoad.js')), 'телефон: ошибка сети при данных из кэша — экран остаётся')
ok(/'stale' : 'error'/.test(src('src/pages/client/useClientChat.js')), 'клиент: список диалогов при ошибке сети остаётся')
ok(/s\.dataKey === cacheKey \? 'stale' : 'error'/.test(src('src/pages/coach/useCoachScheduleData.js')), 'ежедневник: чужую неделю за эту не выдаём')

if (failed) {
  console.error(`\nverify-net-status-bar: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-net-status-bar: ok')
