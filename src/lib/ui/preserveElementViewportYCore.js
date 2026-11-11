/**
 * Удержание элемента на той же высоте экрана при смене высоты контента (вкладки карточки).
 * Без этого короткий таб схлопывает страницу — браузер поднимает скролл, ряд вкладок «прыгает».
 */

export function captureElementViewportTop(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const top = el.getBoundingClientRect().top
  return Number.isFinite(top) ? top : null
}

/** @returns {number} сдвиг scrollY (0 если не надо) */
export function restoreElementViewportTop(el, savedTop, scrollByFn = typeof window !== 'undefined' ? window.scrollBy.bind(window) : null) {
  if (!el || savedTop == null || !Number.isFinite(savedTop) || typeof scrollByFn !== 'function') return 0
  const next = el.getBoundingClientRect().top
  if (!Number.isFinite(next)) return 0
  const delta = next - savedTop
  if (Math.abs(delta) <= 1) return 0
  scrollByFn(0, delta)
  return delta
}
