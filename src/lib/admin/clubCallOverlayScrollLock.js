/**
 * Счётчик lock для оверлеев звонка (история + лист «Позвонить»).
 * Вложенные окна не должны снимать overflow у body, пока верхнее ещё открыто.
 */

let depth = 0
let savedOverflow = ''

/**
 * @returns {() => void} release
 */
export function acquireClubCallOverlayScrollLock() {
  if (typeof document === 'undefined') return () => {}
  if (depth === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  depth += 1
  let released = false
  return () => {
    if (released) return
    released = true
    depth = Math.max(0, depth - 1)
    if (depth === 0) {
      document.body.style.overflow = savedOverflow
      savedOverflow = ''
    }
  }
}

/** @returns {boolean} */
export function isClubCallSheetBackdropOpen() {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector('.club-call-sheet-backdrop'))
}
