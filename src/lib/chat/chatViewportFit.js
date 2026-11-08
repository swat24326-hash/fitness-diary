/**
 * Переписка ровно в видимую часть экрана, как Telegram: листается только лента, страница стоит —
 * шапка и поле ввода не ездят. iPhone не сжимает страницу под клавиатуру (меньше становится только visualViewport),
 * поэтому высоту ленты считаем сами: от верха диалога до низа видимой части, минус отступы оболочки снизу.
 *
 * CSS-контракт: `.chat-thread` — `height` и `max-height: var(--chat-fit-h)`. Без max-height flex:1 у
 * оболочки /coach и /me снова растягивает диалог на весь layout — поле остаётся за клавиатурой
 * (INC-2026-11-09-01), хотя JS уже выставил короткий --chat-fit-h.
 *
 * Android: interactive-widget=resizes-content — обычно сжимает layout. Honor:
 * (1) короткий vv при offsetTop=0 и полном layout — врёт, берём layout (INC-2026-10-29-04);
 * (2) клавиатура с реальным pan (offsetTop>0, vv короче) — как iPhone: высота vv + translateY,
 * иначе шапка с именем уезжает «за горизонт», поле висит над клавиатурой (повтор 04.11).
 */

import { VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX } from '../visualViewportKeyboard.js'

export const CHAT_FIT_VAR = '--chat-fit-h'
export const CHAT_FIT_MIN_PX = 240
/** На <html>, пока открыт диалог: страницу за видимой частью двигает диалог, шапку отдельно не прибивать. */
export const CHAT_FIT_ROOT_ATTR = 'data-chat-fit'

/**
 * iPhone / iPad (в т.ч. iPadOS с «десктопным» UA): layout под клавиатуру не сжимается.
 * @param {{ ua?: string, maxTouchPoints?: number }} p
 */
export function chatFitIsIosLike({ ua = '', maxTouchPoints = 0 } = {}) {
  if (/iP(hone|ad|od)/i.test(ua)) return true
  return /Macintosh/i.test(ua) && Number(maxTouchPoints) > 1
}

/**
 * Браузер реально сдвинул видимую часть к клавиатуре (не «ложный» короткий vv без pan).
 * @param {{ visualHeight: unknown, layoutHeight: unknown, offsetTop?: unknown, scale?: unknown, iosLike?: boolean }} p
 */
export function chatFitShouldFollowPan({
  visualHeight,
  layoutHeight,
  offsetTop = 0,
  scale = 1,
  iosLike = false,
} = {}) {
  if (Number(scale) > 1.01) return false
  const pan = Number(offsetTop) || 0
  if (pan <= 0.5) return false
  if (iosLike) return true
  const vv = Number(visualHeight)
  const layout = Number(layoutHeight)
  if (!Number.isFinite(vv) || vv <= 0 || !Number.isFinite(layout) || layout <= 0) return false
  return vv < layout - VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX
}

/**
 * Какую высоту видимой части брать для подгонки диалога.
 * @param {{ visualHeight: unknown, layoutHeight: unknown, offsetTop?: unknown, iosLike?: boolean }} p
 * @returns {number} px (0 — битые размеры)
 */
export function chatFitViewHeightPx({ visualHeight, layoutHeight, offsetTop = 0, iosLike = false }) {
  const vv = Number(visualHeight)
  const layout = Number(layoutHeight)
  const pan = Number(offsetTop) || 0
  if (!iosLike) {
    /* Реальный pan клавиатуры — vv; короткий vv без pan (Honor врёт) — layout. */
    if (
      chatFitShouldFollowPan({ visualHeight, layoutHeight, offsetTop: pan, iosLike: false }) &&
      Number.isFinite(vv) &&
      vv > 0
    ) {
      return vv
    }
    if (Number.isFinite(layout) && layout > 0) return layout
    return Number.isFinite(vv) && vv > 0 ? vv : 0
  }
  if (pan > 0) {
    if (Number.isFinite(vv) && vv > 0) return vv
    return Number.isFinite(layout) && layout > 0 ? layout : 0
  }
  if (Number.isFinite(vv) && vv > 0) return vv
  return Number.isFinite(layout) && layout > 0 ? layout : 0
}

/**
 * Верх диалога в координатах видимой части (visualViewport), не страницы.
 * getBoundingClientRect — от layout viewport; минус offsetTop — от видимого верха.
 * Так не схлопываем высоту, когда iPhone докрутил страницу к полю до укорачивания диалога
 * (INC-2026-11-03-04: поле у верха, ниже пустота до клавиатуры; закрыть/открыть лечит).
 * @param {{ rectTop: unknown, offsetTop?: unknown }} p
 * @returns {number} px ≥ 0
 */
export function chatFitVisualTopPx({ rectTop, offsetTop = 0 }) {
  const top = Math.round(Number(rectTop) || 0) - Math.round(Number(offsetTop) || 0)
  return top > 0 ? top : 0
}

/**
 * @param {{ viewHeight: unknown, top: unknown, gap: unknown, min?: number }} p
 * top — верх диалога в видимой части; gap — отступы оболочки под ним
 * @returns {number} px
 */
export function chatFitHeightPx({ viewHeight, top, gap, min = CHAT_FIT_MIN_PX }) {
  const view = Number(viewHeight)
  if (!Number.isFinite(view) || view <= 0) return min
  const h = Math.round(view - (Number(top) || 0) - (Number(gap) || 0))
  return Math.max(min, h)
}

/**
 * Браузер докрутил страницу к полю (шапка уехала) — вернуть наверх.
 * Пока открыт диалог, html/body с overflow:hidden: любой scrollY — артефакт фокуса/клавиатуры, не жест человека.
 * @param {{ docHeight?: unknown, viewHeight?: unknown, scrollY: unknown }} p
 */
export function chatFitShouldUnpan({ scrollY }) {
  return (Number(scrollY) || 0) > 0
}

/**
 * На сколько опустить страницу вслед за видимой частью. iPhone, открывая клавиатуру, сдвигает видимую часть
 * вниз (offsetTop) — к полю ввода, каким оно было до укорачивания диалога; сайт этот сдвиг сбросить не может.
 * Без поправки поле оказывается у верхнего края, ниже — пустота до клавиатуры. Пальцами увеличили — не трогаем.
 * @param {{ offsetTop: unknown, scale?: unknown }} p
 * @returns {number} px
 */
export function chatFitShiftPx({ offsetTop, scale = 1 }) {
  const s = Number(scale)
  if (Number.isFinite(s) && s > 1.01) return 0
  const top = Math.round(Number(offsetTop) || 0)
  return top > 0 ? top : 0
}

/** Дольше палец на экране не держат; если iPhone не прислал «отпустил», подгонка всё равно оживёт. */
export const CHAT_FIT_TOUCH_MAX_MS = 2000

/**
 * Палец тянет экран — подгонку откладываем до «отпустил»: иначе пересчёт высоты на каждом кадре
 * спорит с пружиной iPhone и экран дрожит (INC-2026-10-14-04).
 * @param {{ touchStartedAt: number | null, now: number }} p
 */
export function chatFitDeferDuringTouch({ touchStartedAt, now }) {
  if (touchStartedAt == null) return false
  return now - touchStartedAt < CHAT_FIT_TOUCH_MAX_MS
}

/** Оболочка страницы с диалогом — непосредственный потомок #root / body; её и сдвигаем. */
function shellOf(el) {
  let node = el
  while (node.parentElement && node.parentElement !== document.body && node.parentElement.id !== 'root') {
    node = node.parentElement
  }
  return node
}

/** Отступы снизу у самого диалога и у оболочек над ним (padding, border, margin) — то, что окажется под полем ввода. */
function bottomGapPx(el) {
  let gap = 0
  for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
    const s = getComputedStyle(node)
    gap += parseFloat(s.marginBottom) || 0
    if (node !== el) gap += (parseFloat(s.paddingBottom) || 0) + (parseFloat(s.borderBottomWidth) || 0)
  }
  return gap
}

/**
 * @param {HTMLElement | null} el — .chat-thread
 * @returns {() => void}
 */
export function attachChatViewportFit(el) {
  if (!el || typeof window === 'undefined') return () => {}
  const vv = window.visualViewport
  const root = document.documentElement
  const shell = shellOf(el)
  const iosLike = chatFitIsIosLike({
    ua: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
  })
  let shift = 0
  let raf = 0
  let touchStartedAt = null
  let pending = false
  /** @type {ReturnType<typeof setTimeout>[]} */
  let focusTimers = []

  const sync = () => {
    raf = 0
    const layoutHeight = Math.max(window.innerHeight || 0, root.clientHeight || 0)
    const offsetTop = vv?.offsetTop
    const zoomed = Boolean(vv && vv.scale > 1.01)
    const visualHeight = vv ? vv.height : layoutHeight
    const followPan =
      !zoomed &&
      chatFitShouldFollowPan({
        visualHeight,
        layoutHeight,
        offsetTop,
        scale: vv?.scale,
        iosLike,
      })
    /* При pinch-zoom не двигаем оболочку; высоту всё равно считаем — иначе поле ввода пропадает. */
    const viewHeight = chatFitViewHeightPx({
      visualHeight,
      layoutHeight,
      offsetTop: zoomed ? 0 : offsetTop,
      iosLike,
    })
    /* Сдвиг за pan: iPhone всегда; Android — только реальный pan клавиатуры (Honor: шапка не уезжает). */
    const nextShift = followPan ? chatFitShiftPx({ offsetTop, scale: vv?.scale }) : 0
    if (nextShift !== shift) {
      shift = nextShift
      shell.style.transform = shift ? `translateY(${shift}px)` : ''
    }
    let unpanned = false
    if (window.scrollX > 0 || chatFitShouldUnpan({ scrollY: window.scrollY })) {
      window.scrollTo(0, 0)
      unpanned = true
    }
    /* Высота — после сдвига/unpan, от верха в visible viewport (не document+scrollY). */
    const top = chatFitVisualTopPx({
      rectTop: el.getBoundingClientRect().top,
      offsetTop: followPan && vv ? vv.offsetTop : 0,
    })
    const next = `${chatFitHeightPx({ viewHeight, top, gap: bottomGapPx(el) })}px`
    if (el.style.getPropertyValue(CHAT_FIT_VAR) !== next) el.style.setProperty(CHAT_FIT_VAR, next)
    /* После unpan / анимации клавиатуры — ещё кадр, иначе на iPhone 17 Pro высота зависает до закрытия диалога. */
    if (unpanned) schedule()
  }
  const schedule = () => {
    if (chatFitDeferDuringTouch({ touchStartedAt, now: Date.now() })) {
      pending = true
      return
    }
    if (!raf) raf = window.requestAnimationFrame(sync)
  }
  const onTouchStart = () => {
    touchStartedAt = Date.now()
  }
  const onTouchEnd = (e) => {
    if (e.touches?.length) return
    touchStartedAt = null
    if (pending) {
      pending = false
      schedule()
    }
  }
  /* Тап по полю ввода: клавиатура выезжает уже после «отпустил»; фокус снимает отсрочку и даёт кадры после анимации. */
  const onFocusChange = () => {
    touchStartedAt = null
    pending = false
    for (const t of focusTimers) window.clearTimeout(t)
    focusTimers = [window.setTimeout(schedule, 120), window.setTimeout(schedule, 320)]
    schedule()
  }
  const touchOpts = { passive: true, capture: true }

  const ro = typeof ResizeObserver === 'function' && el.parentElement ? new ResizeObserver(schedule) : null
  ro?.observe(el.parentElement)
  vv?.addEventListener('resize', schedule, { passive: true })
  vv?.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
  /* Фокус в поле ввода меняет отступы оболочки снизу (chat.css, pointer: coarse). */
  el.addEventListener('focusin', onFocusChange)
  el.addEventListener('focusout', onFocusChange)
  document.addEventListener('touchstart', onTouchStart, touchOpts)
  document.addEventListener('touchend', onTouchEnd, touchOpts)
  document.addEventListener('touchcancel', onTouchEnd, touchOpts)
  root.setAttribute(CHAT_FIT_ROOT_ATTR, '')
  sync()
  /* Повтор после layout шапки — иначе первый кадр даёт top=0 и поле уезжает под низ (iPhone 17 Pro). */
  window.requestAnimationFrame(() => window.requestAnimationFrame(schedule))
  focusTimers = [window.setTimeout(schedule, 120), window.setTimeout(schedule, 320)]
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    for (const t of focusTimers) window.clearTimeout(t)
    focusTimers = []
    root.removeAttribute(CHAT_FIT_ROOT_ATTR)
    ro?.disconnect()
    vv?.removeEventListener('resize', schedule)
    vv?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    el.removeEventListener('focusin', onFocusChange)
    el.removeEventListener('focusout', onFocusChange)
    document.removeEventListener('touchstart', onTouchStart, touchOpts)
    document.removeEventListener('touchend', onTouchEnd, touchOpts)
    document.removeEventListener('touchcancel', onTouchEnd, touchOpts)
    el.style.removeProperty(CHAT_FIT_VAR)
    if (shift) shell.style.transform = ''
  }
}
