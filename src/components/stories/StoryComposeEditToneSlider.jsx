import { useRef } from 'react'
import {
  storyEditBipolarFill,
  storyEditToneFromClientX,
  storyEditTonePct,
} from '../../lib/stories/storyEditCore.js'

/**
 * Ползунок цвета сторис: жест pointer по треку.
 * На iPhone нативный range внутри вертикального скролла не тянется.
 */
export function StoryComposeEditToneSlider({ tone, value, disabled, onChange }) {
  const wrapRef = useRef(null)
  const dragging = useRef(false)
  const bipolar = tone.bipolar !== false && tone.min < 0
  const pct = storyEditTonePct(value, tone.min, tone.max)
  const fill = storyEditBipolarFill(pct)
  const step = Number(tone.step) > 0 ? Number(tone.step) : 1

  const applyX = (clientX) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    onChange(storyEditToneFromClientX(clientX, rect, tone))
  }

  const onPointerDown = (e) => {
    if (disabled || (e.button != null && e.button !== 0)) return
    dragging.current = true
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    applyX(e.clientX)
  }

  const onPointerMove = (e) => {
    if (!dragging.current || disabled) return
    e.preventDefault()
    applyX(e.clientX)
  }

  const endDrag = (e) => {
    if (!dragging.current) return
    dragging.current = false
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* уже отпущено */
    }
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.max(tone.min, value - step))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.min(tone.max, value + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(tone.min)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(tone.max)
    }
  }

  return (
    <div className="stories-compose-edit__slider-row">
      <span className="stories-compose-edit__slider-label" id={`story-tone-${tone.id}`}>
        {tone.label}
      </span>
      <span
        ref={wrapRef}
        className="stories-compose-edit__bipolar-wrap"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={`story-tone-${tone.id}`}
        aria-valuemin={tone.min}
        aria-valuemax={tone.max}
        aria-valuenow={value}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <input
          type="range"
          className="stories-compose-edit__bipolar"
          min={tone.min}
          max={tone.max}
          step={tone.step}
          value={value}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden
          readOnly
          style={{
            '--fill-start': `${bipolar ? fill.start : 0}%`,
            '--fill-end': `${bipolar ? fill.end : pct}%`,
            pointerEvents: 'none',
          }}
        />
        {bipolar ? <span className="stories-compose-edit__bipolar-mid" aria-hidden /> : null}
      </span>
    </div>
  )
}
