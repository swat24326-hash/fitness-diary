/**
 * Поле ввода переписки над клавиатурой: подъём = часть страницы ниже видимой области.
 * node scripts/verify-chat-keyboard-inset.mjs
 */
import { chatKeyboardInsetPx } from '../src/lib/chat/chatKeyboardInset.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const inset = (layoutHeight, viewHeight, viewOffsetTop = 0, scale = 1) =>
  chatKeyboardInsetPx({ layoutHeight, viewHeight, viewOffsetTop, scale })

ok(inset(844, 844) === 0, 'клавиатуры нет — поле у низа')
ok(inset(500, 500) === 0, 'Chrome сжал страницу под клавиатуру — подъём не нужен')
ok(inset(844, 508) === 336, 'iPhone / Яндекс: клавиатура перекрыла низ — поднять на её высоту')
ok(inset(844, 508, 120) === 216, 'видимая область уехала вниз — подъём меньше на этот сдвиг')
ok(inset(844, 508, 400) === 0, 'видимая область у самого низа страницы — не поднимать')
ok(inset(780, 844) === 0, 'панель браузера спряталась (видно больше страницы) — не отрицательный')
ok(inset(786, 780) === 6, 'страница шире экрана — область раскладки ниже видимой, поле поднять')
ok(inset(844, 843.6) === 0, 'дробный шум < 1px — без подъёма')
ok(inset(844, 422, 0, 2) === 0, 'страницу увеличили пальцами — это не клавиатура')
ok(inset(844, 508, -30) === 336, 'отрицательный offset (оттяжка) не завышает подъём')
ok(inset(null, 508) === 0 && inset(844, 'x') === 0 && inset(0, 0) === 0, 'битые размеры — без подъёма')

console.log('verify-chat-keyboard-inset: all passed')
