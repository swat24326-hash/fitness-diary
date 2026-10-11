import { useEffect, useRef } from 'react'
import { resolveSwipeAxis, resolveSwipeCommit } from '../lib/trainer/scheduleSwipeCore.js'

const OUT_MS = 160
const BACK_MS = 220

/**
 * Листание пальцем вбок: areaRef ловит касание, contentRef едет за пальцем.
 * isBlocked — идёт перенос записи (долгое нажатие), тогда не листаем.
 * @param {{
 *   areaRef: { current: HTMLElement | null },
 *   contentRef: { current: HTMLElement | null },
 *   enabled: boolean,
 *   isBlocked?: () => boolean,
 *   onPrev: () => void,
 *   onNext: () => void,
 * }} opts
 */
export function useScheduleSwipe({ areaRef, contentRef, enabled, isBlocked, onPrev, onNext }) {
  const optsRef = useRef({ isBlocked, onPrev, onNext })
  optsRef.current = { isBlocked, onPrev, onNext }

  useEffect(() => {
    const area = areaRef.current
    if (!enabled || !area) return undefined
    let g = null
    let timer = 0

    const setShift = (px, ms) => {
      const el = contentRef.current
      if (!el) return
      el.style.transition = ms ? `transform ${ms}ms ease-out` : 'none'
      el.style.transform = px ? `translateX(${px}px)` : ''
    }
    const swallowNextClick = () => {
      const stop = (e) => {
        e.stopPropagation()
        e.preventDefault()
      }
      area.addEventListener('click', stop, { capture: true, once: true })
      window.setTimeout(() => area.removeEventListener('click', stop, { capture: true }), 400)
    }

    const onStart = (e) => {
      if (e.touches.length !== 1 || optsRef.current.isBlocked?.()) {
        g = null
        return
      }
      const t = e.touches[0]
      g = { x: t.clientX, y: t.clientY, at: performance.now(), axis: null, dx: 0 }
    }
    const onMove = (e) => {
      if (!g) return
      if (optsRef.current.isBlocked?.()) {
        if (g.axis === 'x') setShift(0, BACK_MS)
        g = null
        return
      }
      const t = e.touches[0]
      const dx = t.clientX - g.x
      if (!g.axis) g.axis = resolveSwipeAxis(dx, t.clientY - g.y)
      if (g.axis === 'y') {
        g = null
        return
      }
      if (g.axis === 'x') {
        g.dx = dx
        setShift(dx, 0)
      }
    }
    const onEnd = () => {
      if (!g || g.axis !== 'x') {
        g = null
        return
      }
      const width = area.clientWidth || 1
      const commit = resolveSwipeCommit({ dx: g.dx, width, ms: performance.now() - g.at })
      g = null
      swallowNextClick()
      if (!commit) {
        setShift(0, BACK_MS)
        return
      }
      const dir = commit === 'next' ? -1 : 1
      setShift(dir * width, OUT_MS)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (commit === 'next') optsRef.current.onNext()
        else optsRef.current.onPrev()
        setShift(-dir * width * 0.3, 0)
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => setShift(0, BACK_MS)))
      }, OUT_MS)
    }

    const onCancel = () => {
      if (g?.axis === 'x') setShift(0, BACK_MS)
      g = null
    }

    area.addEventListener('touchstart', onStart, { passive: true })
    area.addEventListener('touchmove', onMove, { passive: true })
    area.addEventListener('touchend', onEnd)
    area.addEventListener('touchcancel', onCancel)
    return () => {
      window.clearTimeout(timer)
      area.removeEventListener('touchstart', onStart)
      area.removeEventListener('touchmove', onMove)
      area.removeEventListener('touchend', onEnd)
      area.removeEventListener('touchcancel', onCancel)
      setShift(0, 0)
    }
  }, [areaRef, contentRef, enabled])
}
