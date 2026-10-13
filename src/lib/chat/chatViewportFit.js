/**
 * Переписка ровно в видимую часть экрана, как Telegram: листается только лента, страница стоит —
 * шапка и поле ввода не ездят. iPhone не сжимает страницу под клавиатуру (меньше становится только visualViewport),
 * поэтому высоту ленты считаем сами: от верха диалога до низа видимой части, минус отступы оболочки снизу.
 */

export const CHAT_FIT_VAR = '--chat-fit-h'
export const CHAT_FIT_MIN_PX = 240
/** На <html>, пока открыт диалог: страницу за видимой частью двигает диалог, шапку отдельно не прибивать. */
export const CHAT_FIT_ROOT_ATTR = 'data-chat-fit'

/**
 * @param {{ viewHeight: unknown, top: unknown, gap: unknown, min?: number }} p
 * top — верх диалога от верха страницы; gap — отступы оболочки под ним
 * @returns {number} px
 */
export function chatFitHeightPx({ viewHeight, top, gap, min = CHAT_FIT_MIN_PX }) {
  const view = Number(viewHeight)
  if (!Number.isFinite(view) || view <= 0) return min
  const h = Math.round(view - (Number(top) || 0) - (Number(gap) || 0))
  return Math.max(min, h)
}

/**
 * Страница прокручена, хотя диалог уже влез в видимую часть (браузер докрутил к полю ввода до укорачивания) —
 * шапка уехала: возвращаем страницу наверх. Сдвиг самой видимой части (iPhone) — chatFitShiftPx.
 * @param {{ docHeight: unknown, viewHeight: unknown, scrollY: unknown }} p
 */
export function chatFitShouldUnpan({ docHeight, viewHeight, scrollY }) {
  const doc = Number(docHeight)
  const view = Number(viewHeight)
  if (!(doc > 0) || !(view > 0)) return false
  return (Number(scrollY) || 0) > 0 && doc <= view + 1
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
  let shift = 0
  let raf = 0

  const sync = () => {
    raf = 0
    const viewHeight = vv ? vv.height : window.innerHeight
    if (vv && vv.scale > 1.01) return
    const top = el.getBoundingClientRect().top + window.scrollY - shift
    const next = `${chatFitHeightPx({ viewHeight, top, gap: bottomGapPx(el) })}px`
    if (el.style.getPropertyValue(CHAT_FIT_VAR) !== next) el.style.setProperty(CHAT_FIT_VAR, next)
    const nextShift = chatFitShiftPx({ offsetTop: vv?.offsetTop, scale: vv?.scale })
    if (nextShift !== shift) {
      shift = nextShift
      shell.style.transform = shift ? `translateY(${shift}px)` : ''
    }
    if (chatFitShouldUnpan({ docHeight: root.scrollHeight - shift, viewHeight, scrollY: window.scrollY })) {
      window.scrollTo(0, 0)
    }
  }
  const schedule = () => {
    if (!raf) raf = window.requestAnimationFrame(sync)
  }

  const ro = typeof ResizeObserver === 'function' && el.parentElement ? new ResizeObserver(schedule) : null
  ro?.observe(el.parentElement)
  vv?.addEventListener('resize', schedule, { passive: true })
  vv?.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
  /* Фокус в поле ввода меняет отступы оболочки снизу (chat.css, pointer: coarse). */
  el.addEventListener('focusin', schedule)
  el.addEventListener('focusout', schedule)
  root.setAttribute(CHAT_FIT_ROOT_ATTR, '')
  sync()
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    root.removeAttribute(CHAT_FIT_ROOT_ATTR)
    ro?.disconnect()
    vv?.removeEventListener('resize', schedule)
    vv?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    el.removeEventListener('focusin', schedule)
    el.removeEventListener('focusout', schedule)
    el.style.removeProperty(CHAT_FIT_VAR)
    if (shift) shell.style.transform = ''
  }
}
