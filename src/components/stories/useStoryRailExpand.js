import { useCallback, useEffect, useRef, useState } from 'react'
import {
  storyRailExpandAtTop,
  storyRailExpandAxis,
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
 * На /me скролл в `.client-me`. Слушатели touch должны быть и на скроллере —
 * иначе iOS не даёт preventDefault и жест pull не раскрывает кружки (ломало 0b9b1915).
 * @param {Element | null | undefined} el
 * @returns {Element | Document}
 */
function scrollParentOf(el) {
  const me = el?.closest?.('.client-me')
  if (me) {
    const oy = window.getComputedStyle(me).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return me
  }
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
 * Компакт/pull как в Telegram (логика d87816e6 + защита скролла когда ряд уже раскрыт).
 * @returns {{ ref: (el: HTMLElement | null) => void, phone: boolean, progress: number, style: React.CSSProperties | undefined }}
 */
export function useStoryRailExpand() {
  const [railEl, setRailEl] = useState(/** @type {HTMLElement | null} */ (null))
  const [phone, setPhone] = useState(false)
  const [progress, setProgress] = useState(1)
  const progressRef = useRef(1)
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
      progressRef.current = 1
      setProgress(1)
      return undefined
    }

    const applySurface = () => {
      const next = storyRailExpandIsPhone({
        width: window.innerWidth,
        msgrMode: msgrModeNear(railEl),
      })
      const was = phoneRef.current
      phoneRef.current = next
      setPhone(next)
      if (!next) {
        progressRef.current = 1
        setProgress(1)
      } else if (!was) {
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
    /** @type {{ x: number, y: number, from: number, axis: 'none' | 'pull' | 'pan-x', pulling: boolean } | null} */
    let gesture = null

    const onScroll = () => {
      if (progressRef.current < 1) return
      if (storyRailExpandStayOpen({ scrollTop: scroller.scrollTop || 0, expanded: true })) return
      progressRef.current = 0
      setProgress(0)
    }

    const onStart = (e) => {
      if (!e.touches?.[0]) return
      // Раскрытый — не трогаем (скролл /me), как после 0b9b, но pull снова на скроллере
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
      const dx = e.touches[0].clientX - gesture.x
      const dy = e.touches[0].clientY - gesture.y
      if (gesture.axis === 'none') {
        const axis = storyRailExpandAxis({ dx, dy })
        if (axis === 'none') return
        gesture.axis = axis
        if (axis === 'pan-x') {
          gesture = null
          return
        }
      }
      if (gesture.axis !== 'pull') return
      if (!storyRailExpandAtTop(scroller.scrollTop) && dy > 0 && gesture.from < 1 && !gesture.pulling) {
        gesture = null
        return
      }
      gesture.pulling = true
      if (e.cancelable) e.preventDefault()
      const next = storyRailExpandProgress({ dy, from: gesture.from })
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
    // Оба: кружки с touch-action:pan-x отдают вертикаль скроллеру — без него pull мёртв на iPhone
    scroller.addEventListener('touchstart', onStart, opts)
    railEl.addEventListener('touchstart', onStart, opts)
    scroller.addEventListener('touchmove', onMove, moveOpts)
    railEl.addEventListener('touchmove', onMove, moveOpts)
    scroller.addEventListener('touchend', onEnd, opts)
    scroller.addEventListener('touchcancel', onEnd, opts)
    railEl.addEventListener('touchend', onEnd, opts)
    railEl.addEventListener('touchcancel', onEnd, opts)

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      scroller.removeEventListener('touchstart', onStart)
      railEl.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
      railEl.removeEventListener('touchmove', onMove)
      scroller.removeEventListener('touchend', onEnd)
      scroller.removeEventListener('touchcancel', onEnd)
      railEl.removeEventListener('touchend', onEnd)
      railEl.removeEventListener('touchcancel', onEnd)
    }
  }, [phone, railEl])

  const style = phone ? { ['--stories-expand']: String(progress) } : undefined
  return { ref, phone, progress, style }
}
