/**
 * Лента переписки прижата к последнему сообщению, как в Telegram: был внизу — после открытия / закрытия
 * клавиатуры (лента меняет высоту) остаёшься внизу. Листал историю выше — позицию не трогаем.
 * Листается сама лента (.chat-thread__feed), страница стоит (chatViewportFit.js).
 */

export const CHAT_BOTTOM_SLACK_PX = 80

/**
 * @param {{ scrollHeight: unknown, scrollTop: unknown, visibleBottom: unknown, slack?: number }} p
 * visibleBottom — видимая высота ленты (clientHeight)
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
 * К последнему сообщению.
 * @param {HTMLElement|null|undefined} feed — .chat-thread__feed
 * @param {'auto'|'smooth'} [behavior]
 */
export function scrollChatToEnd(feed, behavior = 'auto') {
  feed?.scrollTo({ top: feed.scrollHeight, behavior })
}

/**
 * @param {HTMLElement|null} feed
 * @param {{ onChange?: (atBottom: boolean) => void }} [opts] onChange — человек дошёл до низа / ушёл вверх
 * @returns {() => void}
 */
export function attachChatStickToBottom(feed, { onChange } = {}) {
  if (!feed || typeof window === 'undefined') return () => {}
  const nearBottom = () =>
    isChatNearBottom({ scrollHeight: feed.scrollHeight, scrollTop: feed.scrollTop, visibleBottom: feed.clientHeight })

  /* Диалог открывается на последнем сообщении (ChatThreadView докручивает при первой загрузке). */
  let atBottom = true
  let height = feed.clientHeight
  onChange?.(atBottom)

  /* Прокрутку во время смены высоты (клавиатура, поле ввода выросло) не считаем решением человека. */
  const onScroll = () => {
    if (Math.abs(feed.clientHeight - height) >= 1) return
    const next = nearBottom()
    if (next === atBottom) return
    atBottom = next
    onChange?.(atBottom)
  }
  const onResize = () => {
    const next = feed.clientHeight
    if (Math.abs(next - height) < 1) return
    height = next
    if (atBottom) feed.scrollTop = feed.scrollHeight
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null
  ro?.observe(feed)
  feed.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    ro?.disconnect()
    feed.removeEventListener('scroll', onScroll)
  }
}
