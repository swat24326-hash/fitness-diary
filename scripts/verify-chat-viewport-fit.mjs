/**
 * Переписка ровно в видимую часть экрана: высота ленты от верха диалога до низа видимой части (клавиатура iPhone),
 * лишний сдвиг страницы вверх — вернуть.
 * node scripts/verify-chat-viewport-fit.mjs
 */
import { CHAT_FIT_MIN_PX, chatFitHeightPx, chatFitShouldUnpan } from '../src/lib/chat/chatViewportFit.js'

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

const unpan = (docHeight, viewHeight, scrollY, offsetTop) => chatFitShouldUnpan({ docHeight, viewHeight, scrollY, offsetTop })
ok(unpan(508, 508, 0, 336), 'iPhone сдвинул видимую часть под клавиатуру, диалог уже влез — вернуть наверх')
ok(unpan(508, 508, 120, 0), 'страница прокручена, хотя всё влезло — вернуть наверх')
ok(!unpan(508, 508, 0, 0), 'ничего не сдвинуто — не трогать')
ok(!unpan(1400, 844, 300, 0), 'страница длиннее экрана (над диалогом много всего) — прокрутку человека не трогать')
ok(unpan(508.6, 508, 0, 10), 'дробный шум < 1px — диалог влез')
ok(!unpan(null, 508, 0, 336) && !unpan(508, 'x', 0, 336), 'битые размеры — не трогать')

console.log('verify-chat-viewport-fit: all passed')
