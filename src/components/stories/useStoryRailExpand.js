import { useCallback, useEffect, useRef, useState } from 'react'
import {
  storyRailExpandAtTop,
  storyRailExpandAxis,
  storyRailExpandBlockScroll,
  storyRailExpandCanPull,
  storyRailExpandIsPhone,
  storyRailExpandProgress,
  storyRailExpandSnap,
  storyRailExpandStayOpen,
} from '../../lib/stories/storyRailExpandCore.js'

/**
 * @param {Element | null | undefined} el
 * @returns {'phone' | 'tablet' | 'monitor' | null}
 */
function msgrModeNear(el) {
  const msgr = el?.closest?.('.msgr')
  if (!msgr) return null
  if (msgr.classList.contains('msgr--phone')) return 'phone'
  if (msgr.classList.contains('msgr--tablet')) return 'tablet'
  if (msgr.classList.contains('msgr--monitor')) return 'monitor'
  return null
}

/**
 * @param {Element | null | undefined} el
 * @returns {Element | Document}
 */
function scrollParentOf(el) {
  let n = el?.parentElement
  while (n && n !== document.body) {
    const stil = window.getComputedStyle(n)
    const oy = stil.overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && n.scrollHeight > n.clientHeight + 4) {
      return n
    }
    n = n.parentElement
  }
  return document.scrollingElement || document.documentElement
}

/**
 * Компакт/pull ряда сторис на телефоне. На планшете и мониторе — всегда раскрыт.
 * Скролл /me важнее: жест только на ряду, только вниз, только пока ряд не раскрыт.
 * @returns {{ ref: (el: HTMLElement | null) => void, phone: boolean, progress: number, style: React.CSSProperties | undefined }}
 */
export function useStoryRailExpand() {
  const [railEl, setRailEl] = useState(/** @type {HTMLElement | null} */ (null))
  const [phone, setPhone] = useState(false)
  /** 0 — компакт по умолчанию (телефон /me); монитор в applySurface поднимет до 1 */
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  const phoneRef = useRef(false)
  progressRef.current = progress
  phoneRef.current = phone

  const ref = useCallback((el) => {
    setRailEl(el)
  }, [])

  useEffect(() => {
    if (!railEl) {
      phoneRef.current = false
      setPhone(false)
      progressRef.current = 0
      setProgress(0)
      return undefined
    }

    const applySurface = () => {
      const next = storyRailExpandIsPhone({
        width: window.innerWidth,
        msgrMode: msgrModeNear(railEl),
      })
      phoneRef.current = next
      setPhone(next)
      if (!next) {
        progressRef.current = 1
        setProgress(1)
      } else if (progressRef.current > 1) {
        progressRef.current = 0
        setProgress(0)
      }
    }
    applySurface()
    window.addEventListener('resize', applySurface)
    return () => window.removeEventListener('resize', applySurface)
  }, [railEl])

  useEffect(() => {
    if (!phone || !railEl) return undefined

    const scroller = scrollParentOf(railEl)
    /** @type {{ x: number, y: number, from: number, axis: 'none' | 'pull' | 'pan-x' | 'scroll', pulling: boolean } | null} */
    let gesture = null

    const onScroll = () => {
      if (progressRef.current < 1) return
      if (storyRailExpandStayOpen({ scrollTop: scroller.scrollTop || 0, expanded: true })) return
      progressRef.current = 0
      setProgress(0)
    }

    const onStart = (e) => {
      if (!e.touches?.[0]) return
      // Раскрытый ряд не трогаем — иначе preventDefault убивает скролл /me
      if (!storyRailExpandCanPull(progressRef.current)) {
        gesture = null
        return
      }
      if (!storyRailExpandAtTop(scroller.scrollTop)) {
        gesture = null
        return
      }
      gesture = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        from: progressRef.current,
        axis: 'none',
        pulling: false,
      }
    }

    const onMove = (e) => {
      if (!gesture || !e.touches?.[0]) return
      if (!storyRailExpandCanPull(progressRef.current) && !gesture.pulling) {
        gesture = null
        return
      }
      const dx = e.touches[0].clientX - gesture.x
      const dy = e.touches[0].clientY - gesture.y
      if (gesture.axis === 'none') {
        const axis = storyRailExpandAxis({ dx, dy })
        if (axis === 'none') return
        if (axis === 'scroll' || axis === 'pan-x') {
          gesture = null
          return
        }
        gesture.axis = axis
      }
      if (gesture.axis !== 'pull') return
      if (dy <= 0) {
        if (gesture.pulling) {
          const snapped = storyRailExpandSnap(progressRef.current)
          progressRef.current = snapped
          setProgress(snapped)
        }
        gesture = null
        return
      }
      if (!storyRailExpandAtTop(scroller.scrollTop) && gesture.from < 1) {
        gesture = null
        return
      }
      gesture.pulling = true
      const next = storyRailExpandProgress({ dy, from: gesture.from })
      if (storyRailExpandBlockScroll({ axis: 'pull', dy }) && e.cancelable) {
        e.preventDefault()
      }
      progressRef.current = next
      setProgress(next)
    }

    const onEnd = () => {
      if (!gesture) return
      if (gesture.pulling || gesture.axis === 'pull') {
        const snapped = storyRailExpandSnap(progressRef.current)
        progressRef.current = snapped
        setProgress(snapped)
      }
      gesture = null
    }

    const opts = { passive: true }
    const moveOpts = { passive: false }
    scroller.addEventListener('scroll', onScroll, opts)
    railEl.addEventListener('touchstart', onStart, opts)
    railEl.addEventListener('touchmove', onMove, moveOpts)
    railEl.addEventListener('touchend', onEnd, opts)
    railEl.addEventListener('touchcancel', onEnd, opts)

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      railEl.removeEventListener('touchstart', onStart)
      railEl.removeEventListener('touchmove', onMove)
      railEl.removeEventListener('touchend', onEnd)
      railEl.removeEventListener('touchcancel', onEnd)
    }
  }, [phone, railEl])

  const style = phone ? { ['--stories-expand']: String(progress) } : undefined
  return { ref, phone, progress, style }
}
