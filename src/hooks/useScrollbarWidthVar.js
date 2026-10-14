import { useEffect } from 'react'

/**
 * Пишет ширину вертикальной полосы прокрутки scrollRef в CSS-переменную на hostRef.
 * Мышь на Windows — полоса ~15px, iOS/Android — поверх контента (0): шапка сдвигается ровно на неё.
 * @param {{ current: HTMLElement | null }} scrollRef
 * @param {{ current: HTMLElement | null }} hostRef
 * @param {string} varName
 */
export function useScrollbarWidthVar(scrollRef, hostRef, varName) {
  useEffect(() => {
    const el = scrollRef.current
    const host = hostRef.current
    if (!el || !host) return undefined
    const measure = () => {
      const cs = getComputedStyle(el)
      const borders = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
      host.style.setProperty(varName, `${Math.max(0, el.offsetWidth - el.clientWidth - borders)}px`)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef, hostRef, varName])
}
