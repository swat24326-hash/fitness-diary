import { useId, useState } from 'react'
import { formatDateRu } from '../../lib/dateRu.js'
import {
  nearestDotIndex,
  weightSparkCaption,
  weightSparkGeometry,
  weightSparkPath,
} from '../../lib/client/clientMeHighlightsCore.js'

const W = 300
/** Совпадает с высотой .client-me-spark__plot в px — --drop точек считается в тех же единицах. */
const H = 96
const PAD = 10
const kgRu = (kg) => String(kg).replace('.', ',')

export function ClientWeightSpark({ weights, settling = false, rebuilt = false }) {
  const gradId = useId()
  const [picked, setPicked] = useState(null)
  const g = weightSparkGeometry(weights, W, H, PAD)
  if (!g) {
    const last = weights?.at(-1)
    return last ? (
      <p className="client-me-line">
        Вес: <strong>{kgRu(last.kg)} кг</strong>
      </p>
    ) : null
  }
  const lastIndex = g.dots.length - 1
  const active = picked ?? lastIndex
  const cap = weightSparkCaption(g.dots, active)
  const line = weightSparkPath(g.dots)
  const area = `${line} L${g.dots[lastIndex].x},${H} L${g.dots[0].x},${H} Z`
  const pct = (d) => ({ left: `${(d.x / W) * 100}%`, top: `${(d.y / H) * 100}%` })

  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPicked(nearestDotIndex(g.dots, ((e.clientX - r.left) / r.width) * W))
  }
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') setPicked(Math.max(0, active - 1))
    else if (e.key === 'ArrowRight') setPicked(Math.min(lastIndex, active + 1))
    else if (e.key === 'Escape') setPicked(null)
    else return
    e.preventDefault()
  }

  return (
    <figure
      className={`client-me-spark${rebuilt ? ' client-me-spark--rebuilt' : ''}${settling ? ' client-me-spark--settling' : ''}`}
    >
      <div className="client-me-spark__head" aria-live="polite">
        <strong key={`kg-${active}`} className="client-me-spark__kg">
          {cap.kg}
          <small>кг</small>
        </strong>
        <span key={`note-${active}`} className="client-me-spark__note">
          {cap.date} · {cap.note}
        </span>
      </div>
      <div
        className="client-me-spark__plot"
        role="slider"
        tabIndex={0}
        aria-label="График веса: стрелками — по замерам"
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={active}
        aria-valuetext={`${cap.date}: ${cap.kg} кг`}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPicked(null)}
        onKeyDown={onKey}
      >
        <span className="client-me-spark__grid" style={{ top: `${(PAD / H) * 100}%` }} aria-hidden>
          <span>{kgRu(g.maxKg)}</span>
        </span>
        {g.minKg !== g.maxKg ? (
          <span className="client-me-spark__grid" style={{ top: `${((H - PAD) / H) * 100}%` }} aria-hidden>
            <span>{kgRu(g.minKg)}</span>
          </span>
        ) : null}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.32 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <g className="client-me-spark__reveal">
            <path className="client-me-spark__area" d={area} fill={`url(#${gradId})`} />
            <path className="client-me-spark__line" d={line} />
          </g>
        </svg>
        {picked != null ? (
          <span className="client-me-spark__guide" style={{ left: pct(g.dots[active]).left }} aria-hidden />
        ) : null}
        {g.dots.map((d, i) => (
          <span
            key={`${d.date}-${i}`}
            className={`client-me-spark__dot${i === active ? ' client-me-spark__dot--active' : ''}`}
            style={{ ...pct(d), '--at': `${(d.x / W) * 0.9}s`, '--drop': `${H - d.y}px` }}
            aria-hidden
          />
        ))}
      </div>
      <figcaption className="client-me-spark__axis">
        <span>{formatDateRu(g.dots[0].date)}</span>
        <span>{formatDateRu(g.dots[lastIndex].date)}</span>
      </figcaption>
    </figure>
  )
}
