import { useEffect, useMemo, useState } from 'react'
import { buildPlanProgressVisual } from '../lib/admin/salesPlanProgress.js'
import { formatRub, planProgressPercent } from '../lib/admin/salesReportCore.js'

function formatRubAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

/**
 * @param {{ fact: number, planTotal: number, pulseKey?: number }} props
 */
export function SalesPlanVessel({ fact, planTotal, pulseKey = 0 }) {
  const pct = planProgressPercent(fact, planTotal)
  const visual = useMemo(() => buildPlanProgressVisual(pct), [pct])
  const [mounted, setMounted] = useState(false)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    if (!pulseKey) return undefined
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 800)
    return () => clearTimeout(t)
  }, [pulseKey])

  const hasPlan = planTotal > 0
  const ariaLabel = hasPlan
    ? `Выполнение плана: ${formatRub(fact)} из ${formatRub(planTotal)}, ${pct} процентов`
    : `Факт продаж за месяц: ${formatRub(fact)}`

  return (
    <div className="sales-report__plan-chart" aria-label={ariaLabel}>
      <div className="sales-report__plan-track" aria-hidden>
        <div className="sales-report__plan-ticks">
          {[25, 50, 75, 100].map((tick) => (
            <span key={tick} className="sales-report__plan-tick" style={{ left: `${tick}%` }} />
          ))}
        </div>
        <div
          className={`sales-report__plan-fill${visual.overflow ? ' sales-report__plan-fill--overflow' : ''}${pulse ? ' sales-report__plan-fill--pulse' : ''}${mounted ? ' sales-report__plan-fill--ready' : ''}${visual.fillPercent > 0 ? ' sales-report__plan-fill--active' : ''}`}
          style={{ width: mounted ? `${visual.fillPercent}%` : '0%' }}
        >
          <span className="sales-report__plan-shimmer" />
          <span className="sales-report__plan-edge" />
        </div>
      </div>

      <p className="sales-report__plan-fraction">
        <span className="sales-report__plan-fact">{formatRubAmount(fact)}</span>
        <span className="sales-report__plan-sep">/</span>
        <span className="sales-report__plan-target muted">
          {hasPlan ? `${formatRubAmount(planTotal)} ₽` : '—'}
        </span>
        {hasPlan && visual.overflow ? (
          <span className="sales-report__plan-badge">+{visual.overflowPercent}%</span>
        ) : null}
      </p>
    </div>
  )
}
