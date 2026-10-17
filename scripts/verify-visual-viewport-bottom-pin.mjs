/**
 * node scripts/verify-visual-viewport-bottom-pin.mjs
 */
import {
  tabsShiftDownToLayoutBottomPx,
  visualViewportBottomGapPx,
} from '../src/lib/visualViewportBottomPin.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

ok(visualViewportBottomGapPx({ innerHeight: 800, offsetTop: 0, height: 800 }) === 0, 'vv на весь экран — без подъёма')
ok(visualViewportBottomGapPx({ innerHeight: 800, offsetTop: 0, height: 500 }) === 300, 'клавиатура снизу — поднять на 300')
ok(visualViewportBottomGapPx({ innerHeight: 800, offsetTop: 100, height: 500 }) === 200, 'сдвиг vv + клавиатура')
ok(visualViewportBottomGapPx({ innerHeight: 800, offsetTop: 0, height: 799.7 }) === 0, 'шум < eps')
ok(visualViewportBottomGapPx({ innerHeight: 0, offsetTop: 0, height: 100 }) === 0, 'нулевая высота layout')

ok(tabsShiftDownToLayoutBottomPx({ tabsBottom: 800, layoutHeight: 800 }) === 0, 'панель у низа — без сдвига')
ok(tabsShiftDownToLayoutBottomPx({ tabsBottom: 766, layoutHeight: 800 }) === 34, 'зазор 34px (safe-area WebKit) — опустить')
ok(tabsShiftDownToLayoutBottomPx({ tabsBottom: 799.8, layoutHeight: 800 }) === 0, 'шум < eps')
ok(tabsShiftDownToLayoutBottomPx({ tabsBottom: 900, layoutHeight: 800 }) === 0, 'ниже layout — не трогаем')

if (failed) {
  console.error(`\nverify-visual-viewport-bottom-pin: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-visual-viewport-bottom-pin: OK')
