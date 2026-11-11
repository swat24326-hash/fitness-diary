import { useCallback, useLayoutEffect, useRef } from 'react'
import {
  captureElementViewportTop,
  restoreElementViewportTop,
} from '../lib/ui/preserveElementViewportYCore.js'

/**
 * Перед сменой вкладки: capture(). После рендера — один (и ещё кадр) restore.
 * Не следить за resize в цикле: scrollBy ↔ смена высоты зацикливаются и экран трясётся (Баллы).
 */
export function usePreserveElementViewportY(changeKey) {
  const elRef = useRef(null)
  const savedTopRef = useRef(null)

  const capture = useCallback(() => {
    savedTopRef.current = captureElementViewportTop(elRef.current)
  }, [])

  useLayoutEffect(() => {
    const saved = savedTopRef.current
    if (saved == null) return undefined
    savedTopRef.current = null
    const el = elRef.current
    restoreElementViewportTop(el, saved)
    if (typeof requestAnimationFrame !== 'function') return undefined
    const id = requestAnimationFrame(() => {
      restoreElementViewportTop(el, saved)
    })
    return () => cancelAnimationFrame(id)
  }, [changeKey])

  return { elRef, capture }
}
