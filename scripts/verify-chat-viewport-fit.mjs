/**
 * Переписка ровно в видимую часть экрана: высота ленты от верха диалога до низа видимой части (клавиатура iPhone),
 * лишний сдвиг страницы вверх — вернуть.
 * node scripts/verify-chat-viewport-fit.mjs
 */
import { CHAT_FIT_MIN_PX, chatFitHeightPx, chatFitShiftPx, chatFitShouldUnpan } from '../src/lib/chat/chatViewportFit.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const fit = (viewHeight, top, gap = 0) => chatFitHeightPx({ viewHeight, top, gap })

ok(fit(844, 64) === 780, 'клавиатуры нет — от шапки до низа экрана')
ok(fit(508, 64) === 444, 'iPhone: клавиатура открыта — диалог короче на её высоту, поле над ней')
ok(fit(844, 64, 84) === 696, 'нижние вкладки / отступы оболочки — поле над ними')
ok(fit(900, 76, 12) === 812, 'монитор админа: шапка сайта сверху, отступ 12 снизу')
ok(fit(844, 64.4, 0.3) === 779, 'дробные пиксели округляются')
ok(fit(300, 200) === CHAT_FIT_MIN_PX, 'очень низкий экран — не меньше минимума, лента не схлопывается')
ok(fit(null, 64) === CHAT_FIT_MIN_PX && fit('x', 64) === CHAT_FIT_MIN_PX && fit(0, 0) === CHAT_FIT_MIN_PX, 'битые размеры — минимум')
ok(fit(844, undefined, undefined) === 844, 'нет верха / отступа — весь экран')

const unpan = (docHeight, viewHeight, scrollY) => chatFitShouldUnpan({ docHeight, viewHeight, scrollY })
ok(unpan(508, 508, 120), 'страница прокручена, хотя всё влезло — вернуть наверх')
ok(!unpan(508, 508, 0), 'ничего не прокручено — не трогать')
ok(!unpan(1400, 844, 300), 'страница длиннее экрана (над диалогом много всего) — прокрутку человека не трогать')
ok(unpan(508.6, 508, 10), 'дробный шум < 1px — диалог влез')
ok(!unpan(null, 508, 30) && !unpan(508, 'x', 30), 'битые размеры — не трогать')

const shiftBy = (offsetTop, scale) => chatFitShiftPx({ offsetTop, scale })
ok(shiftBy(336) === 336, 'iPhone сдвинул видимую часть к полю ввода — страница едет за ней, поле над клавиатурой (клиентка 13.10)')
ok(shiftBy(0) === 0 && shiftBy(undefined) === 0, 'сдвига нет — страница на месте')
ok(shiftBy(-30) === 0, 'оттяжка вверх (отрицательный сдвиг) — не двигаем')
ok(shiftBy(120.6) === 121, 'дробные пиксели округляются')
ok(shiftBy(336, 2) === 0, 'страницу увеличили пальцами — это не клавиатура, не двигаем')

console.log('verify-chat-viewport-fit: all passed')
