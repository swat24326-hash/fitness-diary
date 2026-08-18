/**
 * Сдвиг sticky-шапки при visualViewport.offsetTop (клавиатура планшета).
 * node scripts/verify-visual-viewport-chrome-pin.mjs
 */
import {
  chromeStickyTopForVisualOffset,
  overlapScrollByTop,
} from '../src/lib/visualViewportChromePin.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(chromeStickyTopForVisualOffset(0) === '', 'offset 0 — обычный sticky')
ok(chromeStickyTopForVisualOffset(0.4) === '', 'шум < eps — без pin')
ok(chromeStickyTopForVisualOffset(null) === '', 'null — без pin')
ok(chromeStickyTopForVisualOffset('x') === '', 'не число — без pin')
ok(chromeStickyTopForVisualOffset(-12) === '', 'отрицательный (overscroll) — без pin')
ok(chromeStickyTopForVisualOffset(120) === '120px', 'клавиатура сдвинула visible area')
ok(chromeStickyTopForVisualOffset(1) === '1px', 'малый ненулевой offset')

ok(overlapScrollByTop({ fieldTop: 400, visibleTop: 250, chromeHeight: 72 }) === 0, 'поле ниже шапки — не скроллим')
ok(overlapScrollByTop({ fieldTop: 260, visibleTop: 250, chromeHeight: 0 }) === 0, 'нет высоты шапки')
ok(overlapScrollByTop({ fieldTop: 'x', visibleTop: 0, chromeHeight: 72 }) === 0, 'битый fieldTop')
{
  const dy = overlapScrollByTop({ fieldTop: 260, visibleTop: 250, chromeHeight: 72, gap: 10 })
  ok(dy === -(322 + 10 - 260), `поле под шапкой → scrollBy ${dy}`)
  ok(dy < 0, 'скролл вверх документа, чтобы поле ушло ниже шапки')
}
ok(
  overlapScrollByTop({ fieldTop: 321, visibleTop: 250, chromeHeight: 72, gap: 10 }) === 0,
  'перекрытие меньше порога — не дёргаем',
)

console.log('verify-visual-viewport-chrome-pin: all passed')
