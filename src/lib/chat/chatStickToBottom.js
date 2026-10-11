/**
 * Лента переписки прижата к последнему сообщению, как в Telegram: был внизу — после открытия / закрытия
 * клавиатуры (видимая часть меняет высоту) остаёшься внизу. Листал историю выше — позицию не трогаем.
 */

export const CHAT_BOTTOM_SLACK_PX = 80

/**
 * @param {{ scrollHeight: unknown, scrollTop: unknown, visibleBottom: unknown, slack?: number }} p
 * visibleBottom — нижний край видимой части относительно верха окна раскладки (offsetTop + height)
 */
export function isChatNearBottom({ scrollHeight, scrollTop, visibleBottom, slack = CHAT_BOTTOM_SLACK_PX }) {
  const total = Number(scrollHeight)
  const top = Number(scrollTop)
  const bottom = Number(visibleBottom)
  if (![total, top, bottom].every(Number.isFinite)) return true
  return total - (top + bottom) <= slack
}

/**
 * Пришло новое последнее сообщение. Первая загрузка или своё — вниз; был внизу — вниз;
 * читает историю выше — не дёргаем ленту, показываем кнопку «↓ Новые».
 * @returns {'scroll'|'badge'}
 */
export function chatNewMessageAction({ firstLoad, mine, atBottom }) {
  return firstLoad || mine || atBottom ? 'scroll' : 'badge'
}

/**
 * К последнему сообщению. scrollIntoView метки конца ленты оставляет последнее сообщение под закреплённым
 * полем ввода — поэтому дальше докручиваем страницу до самого низа.
 * @param {Element|null|undefined} endEl
 * @param {'auto'|'smooth'} [behavior]
 */
export function scrollChatToEnd(endEl, behavior = 'auto') {
  endEl?.scrollIntoView({ block: 'end', behavior })
  if (typeof window !== 'undefined') window.scrollTo({ top: document.documentElement.scrollHeight, behavior })
}

/**
 * @param {{ onChange?: (atBottom: boolean) => void }} [opts] onChange — человек дошёл до низа / ушёл вверх
 * @returns {() => void}
 */
export function attachChatStickToBottom({ onChange } = {}) {
  if (typeof window === 'undefined') return () => {}
  const vv = window.visualViewport
  const root = document.documentElement
  const visibleHeight = () => (vv ? vv.height : window.innerHeight)
  const visibleBottom = () => (vv ? vv.offsetTop + vv.height : window.innerHeight)
  const nearBottom = () =>
    isChatNearBottom({ scrollHeight: root.scrollHeight, scrollTop: window.scrollY, visibleBottom: visibleBottom() })

  let atBottom = nearBottom()
  let height = visibleHeight()
  let raf = 0
  onChange?.(atBottom)

  /* Прокрутку во время смены высоты (браузер сам двигает страницу) не считаем решением человека. */
  const onScroll = () => {
    if (Math.abs(visibleHeight() - height) >= 1) return
    const next = nearBottom()
    if (next === atBottom) return
    atBottom = next
    onChange?.(atBottom)
  }
  const onResize = () => {
    if (raf) return
    raf = window.requestAnimationFrame(() => {
      raf = 0
      const next = visibleHeight()
      if (Math.abs(next - height) < 1) return
      height = next
      if (atBottom) window.scrollTo(0, root.scrollHeight)
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  vv?.addEventListener('resize', onResize)
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    vv?.removeEventListener('resize', onResize)
  }
}
