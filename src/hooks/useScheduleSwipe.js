import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { resolveSwipeAxis, resolveSwipeCommit } from '../lib/trainer/scheduleSwipeCore.js'

const OUT_MS = 160
const BACK_MS = 220

/**
 * Листание пальцем вбок: areaRef ловит касание, contentRef (один или несколько) едет за пальцем.
 * isBlocked — идёт перенос записи (долгое нажатие), тогда не листаем.
 * carousel — слева и справа от экрана уже нарисованы соседние (лента шириной в 3 экрана, ширина экрана —
 * родитель первой ленты): соседний экран въезжает за пальцем, после смены pageKey лента встаёт на место.
 * flip('next' | 'prev') — то же листание без пальца (перенос записи через край).
 * @param {{
 *   areaRef: { current: HTMLElement | null },
 *   contentRef: { current: HTMLElement | null } | { current: HTMLElement | null }[],
 *   enabled: boolean,
 *   isBlocked?: () => boolean,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   carousel?: boolean,
 *   pageKey?: string,
 * }} opts
 */
export function useScheduleSwipe({ areaRef, contentRef, enabled, isBlocked, onPrev, onNext, carousel = false, pageKey = '' }) {
  const optsRef = useRef({ isBlocked, onPrev, onNext, carousel, contentRef })
  optsRef.current = { isBlocked, onPrev, onNext, carousel, contentRef }
  const timerRef = useRef(0)

  const setShift = useCallback((px, ms) => {
    const refs = optsRef.current.contentRef
    for (const ref of Array.isArray(refs) ? refs : [refs]) {
      const el = ref.current
      if (!el) continue
      el.style.transition = ms ? `transform ${ms}ms ease-out` : 'none'
      el.style.transform = px ? `translateX(${px}px)` : ''
    }
  }, [])

  const pageWidth = useCallback(() => {
    const refs = optsRef.current.contentRef
    const first = (Array.isArray(refs) ? refs[0] : refs)?.current
    if (optsRef.current.carousel) return first?.parentElement?.clientWidth || 1
    return areaRef.current?.clientWidth || 1
  }, [areaRef])

  const go = useCallback(
    (commit) => {
      const width = pageWidth()
      const dir = commit === 'next' ? -1 : 1
      setShift(dir * width, OUT_MS)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (commit === 'next') optsRef.current.onNext()
        else optsRef.current.onPrev()
        if (optsRef.current.carousel) return
        setShift(-dir * width * 0.3, 0)
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => setShift(0, BACK_MS)))
      }, OUT_MS)
    },
    [pageWidth, setShift],
  )

  useLayoutEffect(() => {
    if (carousel) setShift(0, 0)
  }, [carousel, pageKey, setShift])

  useEffect(() => {
    const area = areaRef.current
    if (!enabled || !area) return undefined
    let g = null

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
        if (g?.axis === 'x') setShift(0, BACK_MS)
        g = null
        return
      }
      const t = e.touches[0]
      g = { x: t.clientX, y: t.clientY, at: performance.now(), axis: null, dx: 0 }
    }
    const onMove = (e) => {
      if (!g) return
      if (e.touches.length !== 1 || optsRef.current.isBlocked?.()) {
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
      const commit = resolveSwipeCommit({ dx: g.dx, width: pageWidth(), ms: performance.now() - g.at })
      g = null
      swallowNextClick()
      if (!commit) {
        setShift(0, BACK_MS)
        return
      }
      go(commit)
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
      window.clearTimeout(timerRef.current)
      area.removeEventListener('touchstart', onStart)
      area.removeEventListener('touchmove', onMove)
      area.removeEventListener('touchend', onEnd)
      area.removeEventListener('touchcancel', onCancel)
      setShift(0, 0)
    }
  }, [areaRef, enabled, go, pageWidth, setShift])

  const flip = useCallback(
    (commit) => {
      if (enabled) go(commit)
      else if (commit === 'next') optsRef.current.onNext()
      else optsRef.current.onPrev()
    },
    [enabled, go],
  )

  return { flip }
}
