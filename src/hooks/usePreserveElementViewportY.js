import { useCallback, useLayoutEffect, useRef } from 'react'
import {
  captureElementViewportTop,
  restoreElementViewportTop,
} from '../lib/ui/preserveElementViewportYCore.js'

/** Баллы/дневник догружаются с сети дольше мгновенного рендера — держим якорь дольше. */
const FOLLOW_MS = 1800

/**
 * Перед сменой вкладки: capture(). После рендера и коротких догрузок высоты — ряд остаётся на месте.
 */
export function usePreserveElementViewportY(changeKey) {
  const elRef = useRef(null)
  const observeRef = useRef(null)
  const savedTopRef = useRef(null)

  const capture = useCallback(() => {
    savedTopRef.current = captureElementViewportTop(elRef.current)
  }, [])

  useLayoutEffect(() => {
    const saved = savedTopRef.current
    if (saved == null) return undefined
    const el = elRef.current
    restoreElementViewportTop(el, saved)

    const panel = observeRef.current
    if (!el || !panel || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const fix = () => restoreElementViewportTop(el, saved)
    const ro = new ResizeObserver(fix)
    ro.observe(panel)
    const t = window.setTimeout(() => {
      ro.disconnect()
      savedTopRef.current = null
    }, FOLLOW_MS)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [changeKey])

  return { elRef, observeRef, capture }
}
