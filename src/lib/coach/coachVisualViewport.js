/**
 * Единственная точка входа: visualViewport на телефоне тренера `/coach` (iPhone).
 *
 * Внутри (не импортировать снаружи для новой логики):
 * - `visualViewportKeyboard.js` — фокус в поле / «клавиатура открыта»
 * - `visualViewportBottomPin.js` — нижние вкладки
 * - `coachShellViewportLock.js` — оболочка не уползает
 * - `scheduleModalViewportCore.js` — кадр шторки записи
 *
 * Правила (INC-2026-11-03-05, 10-17-05/08):
 * 1) Оверлей шторки — всегда fullscreen; не ставить top от offsetTop (кнопки под антеннами).
 * 2) Под клавиатуру ужимать панель (height + marginTop), не оверлей.
 * 3) Вкладки поднимать (bottom) только при фокусе в текстовом поле.
 * 4) Без клавиатуры — scrollTo(0,0), вкладки дотянуть translateY к низу layout.
 * 5) Поля ввода формы на телефоне ≥ 16px (иначе iOS zoom «в бок»).
 * 6) safe-area у шторки — селектор сильнее `.card` (`.trainer-schedule-modal__panel.card`).
 */

import { attachCoachShellViewportLock } from './coachShellViewportLock.js'
import { attachVisualViewportBottomPin } from '../visualViewportBottomPin.js'

export {
  VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX,
  visualViewportKeyboardOpen,
  visualViewportTextFieldFocused,
} from '../visualViewportKeyboard.js'

export {
  VISUAL_VIEWPORT_BOTTOM_EPS,
  tabsShiftDownToLayoutBottomPx,
  visualViewportBottomGapPx,
  visualViewportTabsShouldLift,
  attachVisualViewportBottomPin,
} from '../visualViewportBottomPin.js'

export {
  attachCoachShellViewportLock,
  coachShellLayoutLockStyle,
  coachShellPulseViewportMeta,
  coachShellShouldBlockPinchTouch,
  coachShellViewportScaleStuck,
} from './coachShellViewportLock.js'

export {
  scheduleModalFieldFocused,
  scheduleModalFrameHeightPx,
  scheduleModalOverlayInsetStyle,
  scheduleModalPanelFrameStyle,
  scheduleModalPanelMaxHeightPx,
  scheduleModalShouldPinVisualViewport,
} from '../trainer/scheduleModalViewportCore.js'

/**
 * Оболочка + вкладки одним detach.
 * Важно: вкладки порталятся в body — pin вешать в CoachTabs на живой ref,
 * иначе tabs=null и зазор снизу не закрывается (регресс после объединения API).
 * @param {{ shell?: HTMLElement | null, tabs?: HTMLElement | null }} p
 * @returns {() => void}
 */
export function attachCoachVisualViewport({ shell = null, tabs = null } = {}) {
  const stopShell = attachCoachShellViewportLock(shell)
  const stopTabs = attachVisualViewportBottomPin(tabs)
  return () => {
    stopShell()
    stopTabs()
  }
}
