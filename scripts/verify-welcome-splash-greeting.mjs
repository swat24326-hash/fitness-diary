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

console.log('verify-welcome-splash-greeting: all ok')
