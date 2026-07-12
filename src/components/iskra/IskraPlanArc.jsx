import { useEffect, useState } from 'react'

/**
 * Круговая дуга плана — визуал North Star.
 * @param {{ planPct: number, hasPlan?: boolean, tone?: string, size?: number }} props
 */
export function IskraPlanArc({ planPct, hasPlan = true, tone = 'neutral', size = 88 }) {
  const [mounted, setMounted] = useState(false)
  const pct = Math.min(100, Math.max(0, Number(planPct) || 0))
  const r = (size - 10) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (mounted ? (pct / 100) * circumference : 0)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [planPct])

  return (
    <div
      className={`iskra-plan-arc iskra-plan-arc--${tone}`}
      style={{ width: size, height: size }}
      aria-hidden={!hasPlan}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="iskra-plan-arc__track"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth="6"
        />
        <circle
          className="iskra-plan-arc__fill"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="iskra-plan-arc__center">
        <strong>{hasPlan ? `${String(pct).replace('.', ',')}%` : '—'}</strong>
        <span>план</span>
      </div>
    </div>
  )
}
