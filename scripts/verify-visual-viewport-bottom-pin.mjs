/**
 * node scripts/verify-visual-viewport-bottom-pin.mjs
 */
import {
  attachCoachVisualViewport,
  coachShellLayoutLockStyle,
  tabsShiftDownToLayoutBottomPx,
  visualViewportBottomGapPx,
  visualViewportKeyboardOpen,
  visualViewportTabsShouldLift,
  visualViewportTextFieldFocused,
} from '../src/lib/coach/coachVisualViewport.js'

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

ok(visualViewportTextFieldFocused({ tagName: 'INPUT', type: 'search' }) === true, 'keyboard: search field')
ok(
  visualViewportKeyboardOpen({ viewportHeight: 500, layoutHeight: 844, inputFocused: true }) === true,
  'keyboard: short + focus',
)
ok(
  visualViewportKeyboardOpen({ viewportHeight: 500, layoutHeight: 844, inputFocused: false, offsetTop: 0 }) === false,
  'keyboard: sticky short without focus — не поднимать вкладки',
)
ok(
  visualViewportKeyboardOpen({ viewportHeight: 500, layoutHeight: 844, offsetTop: 120 }) === true,
  'keyboard: short + pan',
)
ok(
  visualViewportTabsShouldLift({ viewportHeight: 500, layoutHeight: 844, inputFocused: false }) === false,
  'tabs lift: без фокуса не поднимать (даже короткий vv / 17 Pro)',
)
ok(
  visualViewportTabsShouldLift({ viewportHeight: 500, layoutHeight: 844, inputFocused: true }) === true,
  'tabs lift: фокус + короткий vv',
)
ok(
  visualViewportTabsShouldLift({ viewportHeight: 820, layoutHeight: 844, inputFocused: true }) === false,
  'tabs lift: фокус без укорочения vv',
)

const locked = coachShellLayoutLockStyle({
  offsetTop: 0,
  viewportHeight: 500,
  layoutHeight: 844,
  inputFocused: false,
})
ok(locked.top === '0px' && locked.bottom === '0px' && locked.height === '100%', 'shell lock: sticky short → fullscreen')
const strayPan = coachShellLayoutLockStyle({
  offsetTop: 80,
  viewportHeight: 500,
  layoutHeight: 844,
  inputFocused: false,
})
ok(
  strayPan.top === '0px' && strayPan.left === '0px' && strayPan.width === '100%',
  'shell lock: pan без фокуса — не отпускать (иначе «Сообщения» закусывает с края)',
)
const duringKb = coachShellLayoutLockStyle({
  offsetTop: 80,
  viewportHeight: 500,
  layoutHeight: 844,
  inputFocused: true,
})
ok(duringKb.top === '' && duringKb.height === '', 'shell lock: клавиатура + фокус — вертикаль отпущена')
ok(duringKb.left === '0px' && duringKb.right === '0px' && duringKb.width === '100%', 'shell lock: при печати горизонталь всё равно зажата (не ездить влево-вправо)')
ok(!('transform' in duringKb), 'shell lock: при печати не затирает translateY чата')
ok(strayPan.transform === 'none', 'shell lock: без фокуса transform none (экран не уезжает)')
ok(strayPan.left === '0px' && locked.left === '0px', 'shell lock: left всегда 0')
ok(typeof attachCoachVisualViewport === 'function', 'facade: attachCoachVisualViewport')
ok(typeof attachCoachVisualViewport({}) === 'function', 'facade: attach returns detach')

if (failed) {
  console.error(`\nverify-visual-viewport-bottom-pin: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-visual-viewport-bottom-pin: OK')
