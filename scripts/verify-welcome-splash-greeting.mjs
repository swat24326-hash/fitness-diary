import {
  formatWelcomeGreeting,
  resolveWelcomeGreetingName,
} from '../src/lib/welcomeSplashGreeting.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(resolveWelcomeGreetingName('Дмитрий') === 'Дмитрий', 'одно имя')
ok(resolveWelcomeGreetingName('Плетнёв Дмитрий') === 'Дмитрий', 'Фамилия Имя → имя')
ok(resolveWelcomeGreetingName('Плетнёв Дмитрий Иванович') === 'Дмитрий', 'ФИО → имя')
ok(resolveWelcomeGreetingName('dmitry@club.ru') === 'dmitry', 'email → локальная часть')
ok(resolveWelcomeGreetingName('+7 900 111-22-33') === '', 'телефон не в приветствие')
ok(resolveWelcomeGreetingName('') === '', 'пусто')
ok(formatWelcomeGreeting('Дмитрий') === 'Приветствуем, Дмитрий', 'строка с именем')
ok(formatWelcomeGreeting('') === 'Приветствуем', 'без имени')

console.log('verify-welcome-splash-greeting: all ok')
