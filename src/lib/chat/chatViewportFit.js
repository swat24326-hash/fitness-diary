/**
 * Переписка ровно в видимую часть экрана, как Telegram: листается только лента, страница стоит —
 * шапка и поле ввода не ездят. iPhone не сжимает страницу под клавиатуру (меньше становится только visualViewport),
 * поэтому высоту ленты считаем сами: от верха диалога до низа видимой части, минус отступы оболочки снизу.
 */

export const CHAT_FIT_VAR = '--chat-fit-h'
export const CHAT_FIT_MIN_PX = 240

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
 * iPhone, открывая клавиатуру, сдвигает страницу вверх, чтобы показать поле ввода. Когда диалог уже влез
 * в видимую часть, сдвиг лишний — шапка уехала под часы, снизу пустота: возвращаем страницу наверх.
 * @param {{ docHeight: unknown, viewHeight: unknown, scrollY: unknown, offsetTop: unknown }} p
 */
export function chatFitShouldUnpan({ docHeight, viewHeight, scrollY, offsetTop }) {
  const doc = Number(docHeight)
  const view = Number(viewHeight)
  if (!(doc > 0) || !(view > 0)) return false
  const shifted = (Number(scrollY) || 0) > 0 || (Number(offsetTop) || 0) > 0
  return shifted && doc <= view + 1
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
  let raf = 0

  const sync = () => {
    raf = 0
    const viewHeight = vv ? vv.height : window.innerHeight
    if (vv && vv.scale > 1.01) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const next = `${chatFitHeightPx({ viewHeight, top, gap: bottomGapPx(el) })}px`
    if (el.style.getPropertyValue(CHAT_FIT_VAR) !== next) el.style.setProperty(CHAT_FIT_VAR, next)
    if (chatFitShouldUnpan({ docHeight: root.scrollHeight, viewHeight, scrollY: window.scrollY, offsetTop: vv?.offsetTop })) {
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
  sync()
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    ro?.disconnect()
    vv?.removeEventListener('resize', schedule)
    vv?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    el.removeEventListener('focusin', schedule)
    el.removeEventListener('focusout', schedule)
    el.style.removeProperty(CHAT_FIT_VAR)
  }
}
