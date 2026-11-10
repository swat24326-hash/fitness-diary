import { useId } from 'react'
import { hrZoneBoundsBpm } from '../../lib/hr/hrSessionInsightCore.js'

/**
 * Минималистичный график ЧСС: чёрный фон, линия, тонкие подписи у осей.
 * Зоны по цвету — только в легенде ниже, не на холсте.
 * @param {{
 *   series: number[],
 *   target?: { lo: number, hi: number } | null,
 *   minBpm?: number | null,
 *   maxBpm?: number | null,
 *   maxHr?: number | null,
 *   avgBpm?: number | null,
 * }} props
 */
export function TrainingHrMinuteChart({
  series,
  target = null,
  minBpm = null,
  maxBpm = null,
  maxHr = null,
  avgBpm = null,
}) {
  const uid = useId().replace(/:/g, '')
  if (!Array.isArray(series) || series.length < 2) return null

  const padL = 22
  const padR = 8
  const padT = 6
  const padB = 16
  const W = 320
  const H = 120
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const bounds = hrZoneBoundsBpm(maxHr)
  const max = Number(maxHr)

  const dataMin = Math.min(
    ...series,
    Number.isFinite(Number(minBpm)) ? Number(minBpm) : Infinity,
  )
  const dataMax = Math.max(
    ...series,
    Number.isFinite(Number(maxBpm)) ? Number(maxBpm) : -Infinity,
  )

  let yMin
  let yMax
  if (Number.isFinite(max) && max > 0) {
    yMin = Math.max(40, Math.floor(max * 0.45))
    yMax = Math.ceil(max)
  } else {
    const pad = Math.max(6, Math.round((dataMax - dataMin) * 0.12) || 8)
    yMin = Math.max(40, dataMin - pad)
    yMax = Math.min(220, dataMax + pad)
  }
  const ySpan = Math.max(1, yMax - yMin)
  const n = series.length

  const xAt = (i) => padL + (innerW * i) / Math.max(1, n - 1)
  const yAt = (bpm) => padT + innerH * (1 - (Math.min(yMax, Math.max(yMin, bpm)) - yMin) / ySpan)

  const linePoints = series.map((bpm, i) => `${xAt(i).toFixed(1)},${yAt(bpm).toFixed(1)}`).join(' ')
  const areaPoints = [
    `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)}`,
    ...series.map((bpm, i) => `${xAt(i).toFixed(1)},${yAt(bpm).toFixed(1)}`),
    `${xAt(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`,
  ].join(' ')

  const endMin = n - 1
  const avg = Number(avgBpm)
  const showAvg = Number.isFinite(avg) && avg >= yMin && avg <= yMax

  // Тонкие тики зон у левой оси (без заливки)
  const tickVals = []
  if (bounds) {
    tickVals.push(bounds.mid_lo, bounds.hard_lo)
  }
  if (target?.lo != null) tickVals.push(Number(target.lo))
  if (target?.hi != null) tickVals.push(Number(target.hi))
  const uniqueTicks = [...new Set(tickVals.filter((v) => Number.isFinite(v) && v > yMin && v < yMax))]
    .sort((a, b) => b - a)
    .slice(0, 3)

  return (
    <div className="training-hr-chart training-hr-chart--mono" role="img" aria-label={`График пульса, ${n} мин`}>
      <svg className="training-hr-chart__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`hrFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" stopOpacity="1" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" stopOpacity="1" />
          </linearGradient>
          <clipPath id={`hrClip-${uid}`}>
            <rect x={padL} y={padT} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* plot well */}
        <rect
          className="training-hr-chart__well"
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          rx="2"
        />

        <g clipPath={`url(#hrClip-${uid})`}>
          {uniqueTicks.map((bpm) => (
            <line
              key={`tick-${bpm}`}
              className="training-hr-chart__tick"
              x1={padL}
              y1={yAt(bpm)}
              x2={padL + innerW}
              y2={yAt(bpm)}
            />
          ))}

          {showAvg ? (
            <line
              className="training-hr-chart__avg"
              x1={padL}
              y1={yAt(avg)}
              x2={padL + innerW}
              y2={yAt(avg)}
            />
          ) : null}

          <polygon points={areaPoints} fill={`url(#hrFill-${uid})`} />
          <polyline className="training-hr-chart__line" points={linePoints} fill="none" />
        </g>

        {/* Y labels у оси */}
        <text className="training-hr-chart__axis training-hr-chart__axis--y" x={padL - 3} y={yAt(yMax) + 3} textAnchor="end">
          {Math.round(yMax)}
        </text>
        {uniqueTicks.map((bpm) => {
          const y = yAt(bpm)
          if (Math.abs(y - yAt(yMax)) < 10 || Math.abs(y - yAt(yMin)) < 10) return null
          return (
            <text
              key={`yl-${bpm}`}
              className="training-hr-chart__axis training-hr-chart__axis--y"
              x={padL - 3}
              y={y + 3}
              textAnchor="end"
            >
              {Math.round(bpm)}
            </text>
          )
        })}
        <text className="training-hr-chart__axis training-hr-chart__axis--y" x={padL - 3} y={yAt(yMin) + 3} textAnchor="end">
          {Math.round(yMin)}
        </text>

        {/* X у нижней оси */}
        <text className="training-hr-chart__axis training-hr-chart__axis--x" x={padL} y={H - 2} textAnchor="start">
          0
        </text>
        <text className="training-hr-chart__axis training-hr-chart__axis--x" x={padL + innerW} y={H - 2} textAnchor="end">
          {endMin} мин
        </text>
      </svg>
    </div>
  )
}
