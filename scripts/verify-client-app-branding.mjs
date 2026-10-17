/**
 * Приложение клиента под клуб: manifest с названием клуба, ссылка на него, режим подсказки установки.
 * node scripts/verify-client-app-branding.mjs
 */
import {
  CLIENT_APP_FALLBACK_NAME,
  buildClientManifest,
  cleanClubName,
  clientManifestUrl,
  isClientManifestClubId,
} from '../api/_lib/clientPortal/clientManifestCore.js'
import { clientInstallMode, isIosUserAgent } from '../src/lib/client/clientInstallCore.js'
import {
  armInstallPromptCapture,
  hasInstallPrompt,
  promptInstall,
  subscribeInstallPrompt,
  wasAppInstalled,
} from '../src/lib/pwa/installPromptStore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const CLUB = '6f1c2a4e-1b2c-4d5e-8f90-0a1b2c3d4e5f'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'

const m = buildClientManifest('  FIT-CITY  ')
ok(m.name === 'FIT-CITY' && m.short_name === 'FIT-CITY', 'manifest: название клуба на значке')
ok(m.start_url === '/me' && m.scope === '/me' && m.id === '/me/', 'manifest: только /me, не рабочее приложение')
ok(
  m.display === 'standalone' &&
    m.icons.length === 4 &&
    m.icons.some((i) => i.purpose === 'any') &&
    m.icons.some((i) => i.purpose === 'maskable'),
  'manifest: standalone + иконки',
)
ok(buildClientManifest('').name === CLIENT_APP_FALLBACK_NAME, 'клуб без названия — «Результат Плюс»')
ok(buildClientManifest(null).name === CLIENT_APP_FALLBACK_NAME, 'клуб не найден — «Результат Плюс»')
ok(!/Ядро/.test(JSON.stringify(m)), 'в manifest клиента нет имени продукта')
ok(cleanClubName('Фитнес\n  клуб   «Сила»') === 'Фитнес клуб «Сила»', 'пробелы и переносы схлопываются')
ok(cleanClubName('x'.repeat(80)).length === 40, 'длинное название обрезается')

ok(clientManifestUrl(CLUB) === `/api/client-me?manifest=${CLUB}`, 'ссылка на manifest клуба')
ok(clientManifestUrl('1 OR 1=1') === null && clientManifestUrl('') === null, 'не uuid — ссылки нет')
ok(isClientManifestClubId(CLUB) && !isClientManifestClubId('../etc'), 'проверка id клуба для публичного manifest')

ok(isIosUserAgent(IPHONE) && !isIosUserAgent(ANDROID), 'iPhone распознан, Android — нет')
ok(isIosUserAgent(IPAD_DESKTOP_UA, 5) && !isIosUserAgent(IPAD_DESKTOP_UA, 0), 'iPad с «настольным» UA — по касаниям')
ok(clientInstallMode({ standalone: false, hasPrompt: true, ua: ANDROID }) === 'prompt', 'Android: кнопка «Установить»')
ok(clientInstallMode({ standalone: false, hasPrompt: false, ua: IPHONE }) === 'ios', 'iPhone: инструкция')
ok(clientInstallMode({ standalone: true, hasPrompt: true, ua: ANDROID }) === 'none', 'уже установлено — молчим')
ok(clientInstallMode({ standalone: false, hasPrompt: false, ua: ANDROID }) === 'android', 'Android без окна (Яндекс, Samsung, Chrome ещё не готов) — шаги через меню')
ok(clientInstallMode({ standalone: true, hasPrompt: false, ua: ANDROID }) === 'none', 'Android со значка — молчим')
ok(clientInstallMode({ standalone: false, hasPrompt: false, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128' }) === 'none', 'компьютер без окна — молчим')

{
  const handlers = {}
  const win = { addEventListener: (t, fn) => (handlers[t] = fn) }
  armInstallPromptCapture(win)
  let changes = 0
  const off = subscribeInstallPrompt(() => (changes += 1))
  ok(!hasInstallPrompt(), 'до сигнала браузера кнопки нет')
  let prevented = false
  let prompted = false
  handlers.beforeinstallprompt({
    preventDefault: () => (prevented = true),
    prompt: () => (prompted = true),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  })
  ok(prevented && hasInstallPrompt() && changes === 1, 'сигнал пойман при старте, до экранов — кнопка появится, когда экран догрузится')
  ok((await promptInstall()) === true && prompted && !hasInstallPrompt() && wasAppInstalled(), 'установили — окно браузера одноразовое, кнопка гаснет')
  ok((await promptInstall()) === false, 'второй раз окна нет')
  off()
}
if (failed) {
  console.error(`\nverify-client-app-branding: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-app-branding: OK')
