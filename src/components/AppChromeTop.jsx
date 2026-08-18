import { useLayoutEffect, useRef } from 'react'
import { attachVisualViewportChromePin } from '../lib/visualViewportChromePin'

/** Общая шапка: sticky при скролле; при открытой клавиатуре — вверху visible viewport (пульс). */
export function AppChromeTop({ children }) {
  const ref = useRef(null)

  useLayoutEffect(() => attachVisualViewportChromePin(ref.current), [])

  return (
    <div className="app-chrome-top" ref={ref}>
      {children}
    </div>
  )
}
