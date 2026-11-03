import { useEffect, useState } from 'react'
import {
  scheduleModalFrameHeightPx,
  scheduleModalOverlayInsetStyle,
  scheduleModalShouldPinVisualViewport,
} from '../lib/trainer/scheduleModalViewportCore.js'

/**
 * Оверлей формы записи на весь visible viewport; панель на 100% оверлея (не «карточка с запасом»).
 * Без клавиатуры — CSS inset:0 (не цеплять offsetTop: иначе кнопки уезжают под статус-бар iPhone).
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
      const pin = scheduleModalShouldPinVisualViewport({ viewportHeight, layoutHeight })
      const height = scheduleModalFrameHeightPx({
        viewportHeight,
        layoutHeight,
        offsetTop,
      })
      if (height == null) {
        setOverlayStyle({})
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
    /* После закрытия клавиатуры vv иногда обновляется с задержкой. */
    const t1 = window.setTimeout(schedule, 120)
    const t2 = window.setTimeout(schedule, 320)
    if (vv) {
      vv.addEventListener('resize', schedule, { passive: true })
      vv.addEventListener('scroll', schedule, { passive: true })
    }
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      if (vv) {
        vv.removeEventListener('resize', schedule)
        vv.removeEventListener('scroll', schedule)
      }
      window.removeEventListener('resize', schedule)
    }
  }, [open])

  return { overlayStyle, panelStyle }
}
