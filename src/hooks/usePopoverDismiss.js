import { useEffect } from 'react'

/**
 * Закрыть всплывашку тапом мимо неё или Escape.
 * @param {boolean} open
 * @param {() => void} close
 * @param {{ current: HTMLElement | null }} rootRef
 */
export function usePopoverDismiss(open, close, rootRef) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      if (!rootRef.current?.contains(/** @type {Node} */ (e.target))) close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close, rootRef])
}
