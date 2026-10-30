import { useId, useRef, useState } from 'react'
import { Vibrate } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import {
  nearestDotIndex,
  weightSparkCaption,
  weightSparkGeometry,
  weightSparkPath,
} from '../../lib/client/clientMeHighlightsCore.js'
import { useSparkShake } from './useSparkShake.js'
import { useSparkWave } from './useSparkWave.js'

const W = 300
/** Совпадает с высотой .client-me-spark__plot в px — --drop точек считается в тех же единицах. */
const H = 96
const PAD = 10
const kgRu = (kg) => String(kg).replace('.', ',')

/**
 * @param {{
 *   weights: { date: string, kg: number, source?: string, id?: string }[]
 *   settling?: boolean
 *   rebuilt?: boolean
 *   onPickSelf?: (point: { date: string, kg: number, id?: string, source?: string }) => void
 * }} props
 */
export function ClientWeightSpark({ weights, settling = false, rebuilt = false, onPickSelf }) {
  const gradId = useId()
  const [picked, setPicked] = useState(null)
  const rootRef = useRef(null)
  const g = weightSparkGeometry(weights, W, H, PAD)
  const motion = useSparkShake(rootRef, g?.dots.length ?? 0, settling)
  const lifts = useSparkWave(motion.shake)
  if (!g) {
    const last = weights?.at(-1)
    return last ? (
      <p className="client-me-line">
        Вес: <strong>{kgRu(last.kg)} кг</strong>
        {last.source === 'client' ? <span className="client-me-muted"> · вы внесли</span> : null}
      </p>
    ) : null
  }
  const lastIndex = g.dots.length - 1
  const active = picked ?? lastIndex
  const cap = weightSparkCaption(g.dots, active)
  const dots = lifts ? g.dots.map((d, i) => ({ ...d, y: d.y + (lifts[i] ?? 0) })) : g.dots
  const line = weightSparkPath(dots)
  const area = `${line} L${dots[lastIndex].x},${H} L${dots[0].x},${H} Z`
  const pct = (d) => ({ left: `${(d.x / W) * 100}%`, top: `${(d.y / H) * 100}%` })
  const activeDot = g.dots[active]

  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const idx = nearestDotIndex(g.dots, ((e.clientX - r.left) / r.width) * W)
    setPicked(idx)
    const d = g.dots[idx]
    if (d?.source === 'client' && onPickSelf) onPickSelf(d)
  }
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') setPicked(Math.max(0, active - 1))
    else if (e.key === 'ArrowRight') setPicked(Math.min(lastIndex, active + 1))
    else if (e.key === 'Enter' || e.key === ' ') {
      if (activeDot?.source === 'client' && onPickSelf) onPickSelf(activeDot)
    } else if (e.key === 'Escape') setPicked(null)
    else return
    e.preventDefault()
  }

  return (
    <figure
      ref={rootRef}
      className={`client-me-spark${rebuilt ? ' client-me-spark--rebuilt' : ''}${settling ? ' client-me-spark--settling' : ''}${lifts ? ' client-me-spark--wave' : ''}`}
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
        aria-label="График веса: стрелками — по замерам, Enter — изменить свой"
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={active}
        aria-valuetext={`${cap.date}: ${cap.kg} кг, ${cap.note}`}
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
            className={`client-me-spark__dot${d.source === 'client' ? ' client-me-spark__dot--self' : ''}${i === active ? ' client-me-spark__dot--active' : ''}`}
            style={{ ...pct(dots[i]), '--at': `${(d.x / W) * 0.9}s`, '--drop': `${H - d.y}px` }}
            aria-hidden
          />
        ))}
      </div>
      <figcaption className="client-me-spark__axis">
        <span>{formatDateRu(g.dots[0].date)}</span>
        <span>{formatDateRu(g.dots[lastIndex].date)}</span>
      </figcaption>
      {motion.hint ? (
        <button type="button" className="client-me-spark__shake" onClick={motion.onHint}>
          <Vibrate size={16} aria-hidden />
          Потрясите телефон
        </button>
      ) : null}
    </figure>
  )
}
