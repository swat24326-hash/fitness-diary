import { useRef } from 'react'

const STEP = 16

/**
 * Разделитель между колонками на мониторе: тянуть мышью, стрелки ←/→ с клавиатуры, двойной щелчок — как было.
 * Ширину колонки берём с соседа слева (previousElementSibling) — разметку не нужно знать заранее.
 * @param {{ col: 'rail' | 'list', label: string, onResize: (col: 'rail' | 'list', px: number, commit?: boolean) => void, onReset: (col: 'rail' | 'list') => void }} props
 */
export function MessengerResizeHandle({ col, label, onResize, onReset }) {
  const drag = useRef(null)
  const widthLeft = (el) => el.previousElementSibling?.getBoundingClientRect().width ?? 0

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: widthLeft(e.currentTarget) }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    onResize(col, drag.current.w + e.clientX - drag.current.x)
  }
  const onPointerUp = (e) => {
    if (!drag.current) return
    onResize(col, drag.current.w + e.clientX - drag.current.x, true)
    drag.current = null
  }
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    onResize(col, widthLeft(e.currentTarget) + dir * STEP, true)
  }

  return (
    <div
      className="msgr__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label} — потяните; двойной щелчок — как было`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null
      }}
      onDoubleClick={() => onReset(col)}
      onKeyDown={onKeyDown}
    />
  )
}
