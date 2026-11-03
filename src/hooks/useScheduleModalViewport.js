import { useEffect, useState } from 'react'
import {
  scheduleModalFieldFocused,
  scheduleModalFrameHeightPx,
  scheduleModalOverlayInsetStyle,
  scheduleModalShouldPinVisualViewport,
} from '../lib/trainer/scheduleModalViewportCore.js'

/**
 * Оверлей на весь экран; к visualViewport — только пока клавиатура (фокус в поле).
 * После blur не оставлять короткий кадр (календарь просвечивает) и не держать top под антеннами.
 * @param {boolean} open
 * @returns {{ overlayStyle: Record<string, string>, panelStyle: Record<string, string> }}
 */
export function useScheduleModalViewport(open) {
  const [overlayStyle, setOverlayStyle] = useState(/** @type {Record<string, string>} */ ({}))
  const [panelStyle, setPanelStyle] = useState(/** @type {Record<string, string>} */ ({}))

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      setOverlayStyle({})
      setPanelStyle({})
      return undefined
    }
    const vv = window.visualViewport
    let raf = 0
    const sync = () => {
      raf = 0
      const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
      const offsetTop = vv?.offsetTop ?? 0
      const viewportHeight = vv?.height ?? layoutHeight
      const inputFocused = scheduleModalFieldFocused(document.activeElement)
      const pin = scheduleModalShouldPinVisualViewport({
        viewportHeight,
        layoutHeight,
        offsetTop,
        inputFocused,
      })
      if (!pin && (offsetTop > 0.5 || window.scrollY > 0)) {
        window.scrollTo(0, 0)
      }
      const height = scheduleModalFrameHeightPx({
        viewportHeight,
        layoutHeight,
        offsetTop,
        inputFocused,
      })
      if (height == null) {
        setOverlayStyle(scheduleModalOverlayInsetStyle({ offsetTop: 0, height: 0, pin: false }))
        setPanelStyle({ height: '100%', maxHeight: '100%', width: '100%' })
        return
      }
      setOverlayStyle(scheduleModalOverlayInsetStyle({ offsetTop, height, pin }))
      setPanelStyle({ height: '100%', maxHeight: '100%', width: '100%' })
    }
    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(sync)
    }
    sync()
    const t1 = window.setTimeout(schedule, 120)
    const t2 = window.setTimeout(schedule, 320)
    if (vv) {
      vv.addEventListener('resize', schedule, { passive: true })
      vv.addEventListener('scroll', schedule, { passive: true })
    }
    window.addEventListener('resize', schedule, { passive: true })
    document.addEventListener('focusin', schedule, true)
    document.addEventListener('focusout', schedule, true)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      if (vv) {
        vv.removeEventListener('resize', schedule)
        vv.removeEventListener('scroll', schedule)
      }
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule, true)
      document.removeEventListener('focusout', schedule, true)
    }
  }, [open])

  return { overlayStyle, panelStyle }
}
