/**
 * Поле ввода переписки над клавиатурой телефона. iPhone, Яндекс Браузер, Samsung Internet не сжимают страницу
 * под клавиатуру, а только видимую область (visualViewport): sticky bottom: 0 уходит под клавиатуру.
 * Подъём = часть страницы ниже видимой области.
 */

export const CHAT_KB_VAR = '--chat-kb'

/**
 * @param {{ layoutHeight: unknown, viewHeight: unknown, viewOffsetTop: unknown, scale?: unknown }} p
 * @returns {number} px, на сколько поднять поле от низа страницы
 */
export function chatKeyboardInsetPx({ layoutHeight, viewHeight, viewOffsetTop, scale = 1 }) {
  const layout = Number(layoutHeight)
  const view = Number(viewHeight)
  const top = Number(viewOffsetTop) || 0
  const s = Number(scale)
  if (!Number.isFinite(layout) || !Number.isFinite(view) || layout <= 0 || view <= 0) return 0
  /* Пальцами увеличили страницу — видимая область уменьшилась не из-за клавиатуры. */
  if (Number.isFinite(s) && s > 1.01) return 0
  const inset = Math.round(layout - view - Math.max(0, top))
  return inset >= 1 ? inset : 0
}

/**
 * Пишет подъём в CSS-переменную формы ввода.
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function attachChatKeyboardInset(el) {
  if (!el || typeof window === 'undefined') return () => {}
  const vv = window.visualViewport
  if (!vv) return () => {}
  let raf = 0

  const sync = () => {
    raf = 0
    const px = chatKeyboardInsetPx({
      layoutHeight: document.documentElement.clientHeight,
      viewHeight: vv.height,
      viewOffsetTop: vv.offsetTop,
      scale: vv.scale,
    })
    const next = px ? `${px}px` : ''
    if (el.style.getPropertyValue(CHAT_KB_VAR) !== next) el.style.setProperty(CHAT_KB_VAR, next)
  }
  const schedule = () => {
    if (!raf) raf = window.requestAnimationFrame(sync)
  }

  vv.addEventListener('resize', schedule, { passive: true })
  vv.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('scroll', schedule, { passive: true })
  sync()
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', schedule)
    window.removeEventListener('scroll', schedule)
    el.style.removeProperty(CHAT_KB_VAR)
  }
}
