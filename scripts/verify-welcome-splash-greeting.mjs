import {
  formatWelcomeGreeting,
  looksLikeRussianSurname,
  resolveWelcomeGreetingName,
} from '../src/lib/welcomeSplashGreeting.js'
import {
  WELCOME_SPLASH_MIN_MS,
  shouldHoldWelcomeSplash,
  welcomeSplashRemainMs,
} from '../src/lib/welcomeSplashHoldCore.js'
import {
  WELCOME_BOOT_ZOOM_FROM,
  WELCOME_BOOT_ZOOM_MS,
  WELCOME_MARK_PX,
} from '../src/lib/welcomeSplashLayoutCore.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const welcomeCss = fs.readFileSync(path.join(root, 'src/styles/app-welcome.css'), 'utf8')
const splashJsx = fs.readFileSync(path.join(root, 'src/components/AppWelcomeSplash.jsx'), 'utf8')

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(looksLikeRussianSurname('Семенов'), 'Семенов — фамилия')
ok(looksLikeRussianSurname('Смирнова'), 'Смирнова — фамилия')
ok(!looksLikeRussianSurname('Дмитрий'), 'Дмитрий — не фамилия')
ok(!looksLikeRussianSurname('Мария'), 'Мария — не фамилия')

ok(resolveWelcomeGreetingName('Дмитрий') === 'Дмитрий', 'одно имя')
ok(resolveWelcomeGreetingName('Семенов') === '', 'одна фамилия — не в приветствие')
ok(resolveWelcomeGreetingName('Плетнёв Дмитрий') === 'Дмитрий', 'Фамилия Имя → имя')
ok(resolveWelcomeGreetingName('Плетнёв Дмитрий Иванович') === 'Дмитрий', 'ФИО → имя')
ok(resolveWelcomeGreetingName('Дмитрий Семенов') === 'Дмитрий', 'Имя Фамилия → имя')
ok(resolveWelcomeGreetingName('dmitry@club.ru') === 'dmitry', 'email → локальная часть')
ok(resolveWelcomeGreetingName('+7 900 111-22-33') === '', 'телефон не в приветствие')
ok(resolveWelcomeGreetingName('') === '', 'пусто')
ok(formatWelcomeGreeting('Дмитрий') === 'Приветствуем, Дмитрий', 'строка с именем')
ok(formatWelcomeGreeting('') === 'Приветствуем', 'без имени')

const t0 = 1_000_000
ok(WELCOME_SPLASH_MIN_MS >= 2000, 'минимум ≥ 2 с')
ok(welcomeSplashRemainMs(t0, t0 + 500) === WELCOME_SPLASH_MIN_MS - 500, 'остаток после 500 мс')
ok(shouldHoldWelcomeSplash(t0, t0 + 500), 'ещё держим')
ok(!shouldHoldWelcomeSplash(t0, t0 + WELCOME_SPLASH_MIN_MS), 'минимум вышел')
ok(welcomeSplashRemainMs(0, t0) === 0, 'без старта — не держим')

ok(WELCOME_MARK_PX === 96, 'mark 96px')
ok(WELCOME_BOOT_ZOOM_FROM === 2.3, 'zoom from 2.3')
ok(WELCOME_BOOT_ZOOM_MS === 1150, 'zoom 1150ms')
ok(indexHtml.includes(`width: ${WELCOME_MARK_PX}px`), 'index.html mark size = layout core')
ok(indexHtml.includes(`scale(${WELCOME_BOOT_ZOOM_FROM})`), 'index.html zoom from = layout core')
ok(indexHtml.includes(`${WELCOME_BOOT_ZOOM_MS}ms`), 'index.html zoom ms = layout core')
ok(welcomeCss.includes('translate(-50%, -50%)'), 'React mark centered like boot')
ok(welcomeCss.includes('app-welcome__mark--from-boot'), 'from-boot handoff class')
ok(welcomeCss.includes('welcome-mark-tilt-from-boot'), 'from-boot tilt starts flat')
ok(splashJsx.includes('app-welcome__copy'), 'greeting outside mark flow')
ok(splashJsx.includes('WELCOME_MARK_PX'), 'splash uses layout mark size')

console.log('verify-welcome-splash-greeting: all ok')
