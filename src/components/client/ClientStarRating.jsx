import { useRef } from 'react'
import { formatRatingScoreRu, scoreFromStarRatio } from '../../lib/client/clientRatingCore.js'

/**
 * 5 звёзд с половинами (шаг 0.5), тап и ведение пальцем — как в Яндексе.
 * @param {{ value: number | null, onChange: (n: number) => void, disabled?: boolean }} props
 */
export function ClientStarRating({ value, onChange, disabled = false }) {
  const trackRef = useRef(null)

  const setFromClientX = (clientX) => {
    if (disabled || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    if (!(rect.width > 0)) return
    const ratio = (clientX - rect.left) / rect.width
    onChange(scoreFromStarRatio(ratio))
  }

  const score = value != null && value >= 1 ? value : 0

  return (
    <div className="client-star-rating">
      <div
        ref={trackRef}
        className={`client-star-rating__track${disabled ? ' client-star-rating__track--off' : ''}`}
        role="slider"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={score || undefined}
        aria-valuetext={score ? formatRatingScoreRu(score) : 'без оценки'}
        aria-label="Оценка от 1 до 5"
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromClientX(e.clientX)
        }}
        onPointerMove={(e) => {
          if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return
          setFromClientX(e.clientX)
        }}
        onKeyDown={(e) => {
          if (disabled) return
          const cur = score || 1
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(5, cur + 0.5))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(1, cur - 0.5))
          }
        }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, score - (star - 1)))
          return (
            <span key={star} className="client-star-rating__star" aria-hidden>
              <span className="client-star-rating__ghost">★</span>
              <span className="client-star-rating__fill" style={{ width: `${fill * 100}%` }}>
                ★
              </span>
            </span>
          )
        })}
      </div>
      <p className="client-star-rating__value" aria-live="polite">
        {score ? formatRatingScoreRu(score) : '—'}
      </p>
    </div>
  )
}
