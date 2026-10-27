/**
 * Жесты просмотра сторис (как в Telegram): вниз — закрыть, влево/вправо — соседний автор.
 * Чистые пороги без DOM.
 */

export const STORY_SWIPE_CLOSE_PX = 96
export const STORY_SWIPE_PEER_PX = 72
/** Пока палец не ушёл дальше — это удержание паузы, не свайп. */
export const STORY_SWIPE_DEAD_PX = 14

/**
 * @param {{ dx: number, dy: number }} move
 * @returns {'close' | 'peer-next' | 'peer-prev' | 'none'}
 */
export function storySwipeIntent({ dx, dy }) {
  const ax = Math.abs(Number(dx) || 0)
  const ay = Math.abs(Number(dy) || 0)
  if (ax < STORY_SWIPE_DEAD_PX && ay < STORY_SWIPE_DEAD_PX) return 'none'
  if (ay >= ax && ay >= STORY_SWIPE_CLOSE_PX && dy > 0) return 'close'
  if (ax > ay && ax >= STORY_SWIPE_PEER_PX) return dx < 0 ? 'peer-next' : 'peer-prev'
  return 'none'
}
