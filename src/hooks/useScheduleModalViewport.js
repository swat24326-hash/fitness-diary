import { useEffect, useState } from 'react'
import {
  scheduleModalOverlayInsetStyle,
  scheduleModalPanelMaxHeightPx,
} from '../lib/trainer/scheduleModalViewportCore.js'

/**
 * Сжимает оверлей и панель формы записи под visualViewport (клавиатура на телефоне).
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
      const height = vv?.height ?? window.innerHeight
      const offsetTop = vv?.offsetTop ?? 0
      setOverlayStyle(scheduleModalOverlayInsetStyle({ offsetTop, height }))
      const max = scheduleModalPanelMaxHeightPx({ viewportHeight: height })
      setPanelStyle(max != null ? { maxHeight: `${max}px` } : {})
    }
    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(sync)
    }
    sync()
    if (vv) {
      vv.addEventListener('resize', schedule, { passive: true })
      vv.addEventListener('scroll', schedule, { passive: true })
    }
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      if (vv) {
        vv.removeEventListener('resize', schedule)
        vv.removeEventListener('scroll', schedule)
      }
      window.removeEventListener('resize', schedule)
    }
  }, [open])

  return { overlayStyle, panelStyle }
}
