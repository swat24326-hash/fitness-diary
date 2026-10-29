/**
 * Переписка ровно в видимую часть экрана: высота ленты от верха диалога до низа видимой части (клавиатура iPhone),
 * лишний сдвиг страницы вверх — вернуть. Android/Honor: не верить укороченному visualViewport при полном layout.
 * node scripts/verify-chat-viewport-fit.mjs
 */
import {
  CHAT_FIT_MIN_PX,
  CHAT_FIT_TOUCH_MAX_MS,
  chatFitDeferDuringTouch,
  chatFitHeightPx,
  chatFitIsIosLike,
  chatFitShiftPx,
  chatFitShouldUnpan,
  chatFitViewHeightPx,
} from '../src/lib/chat/chatViewportFit.js'

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

const defer = (touchStartedAt, now) => chatFitDeferDuringTouch({ touchStartedAt, now })
ok(defer(1000, 1300), 'палец тянет экран — подгонку отложить, не спорить с пружиной iPhone (INC-2026-10-14-04)')
ok(!defer(null, 1300), 'палец отпущен — подгонка сразу')
ok(!defer(1000, 1000 + CHAT_FIT_TOUCH_MAX_MS), 'iPhone не прислал «отпустил» — через 2 с подгонка всё равно оживает, поле не застрянет')

ok(chatFitIsIosLike({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), 'iPhone — iosLike')
ok(chatFitIsIosLike({ ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }), 'iPad — iosLike')
ok(chatFitIsIosLike({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), 'iPadOS desktop UA — iosLike')
ok(!chatFitIsIosLike({ ua: 'Mozilla/5.0 (Linux; Android 13; ANY-LX1) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36' }), 'Honor/Android — не iosLike')
ok(!chatFitIsIosLike({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'компьютер — не iosLike')

const view = (visualHeight, layoutHeight, offsetTop = 0, iosLike = false) =>
  chatFitViewHeightPx({ visualHeight, layoutHeight, offsetTop, iosLike })

ok(view(400, 1200, 0, false) === 1200, 'Honor: vv врёт короткий, layout полный — берём layout, поле не уезжает вверх (INC-2026-10-29-04)')
ok(view(800, 800, 0, false) === 800, 'Android: layout сжат клавиатурой (resizes-content) — высота layout')
ok(view(500, 844, 0, true) === 500, 'iPhone: layout полный, vv короче — берём vv')
ok(view(508, 844, 336, true) === 508, 'iPhone со сдвигом offsetTop — высота видимой части')
ok(view(508, 844, 336, false) === 508, 'сдвиг offsetTop на любом UA — высота видимой части')
ok(view(null, 900, 0, false) === 900, 'нет vv — layout')
ok(view('x', 0, 0, false) === 0 && view(null, null, 0, true) === 0, 'битые размеры — 0')

console.log('verify-chat-viewport-fit: all passed')
