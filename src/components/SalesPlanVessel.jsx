import { useEffect, useMemo, useState } from 'react'
import { formatRub, planProgressPercent } from '../lib/admin/salesReportCore.js'

/**
 * @param {{ fact: number, planTotal: number, pulseKey?: number }} props
 */
export function SalesPlanVessel({ fact, planTotal, pulseKey = 0 }) {
  const pct = planProgressPercent(fact, planTotal)
  const fillPct = Math.min(100, Math.max(0, pct))
  const overflow = pct > 100
  const [mounted, setMounted] = useState(false)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    if (!pulseKey) return undefined
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [pulseKey])

  const height = useMemo(() => (mounted ? `${fillPct}%` : '0%'), [mounted, fillPct])

  return (
    <div className="sales-report__vessel-wrap">
      <div
        className={`sales-report__vessel${overflow ? ' sales-report__vessel--overflow' : ''}${pulse ? ' sales-report__vessel--pulse' : ''}`}
        aria-hidden
      >
        <div className="sales-report__vessel-glass">
          <div className="sales-report__vessel-liquid" style={{ height }} />
        </div>
      </div>
      <div className="sales-report__vessel-stats">
        <p className="sales-report__vessel-fact">{formatRub(fact)}</p>
        <p className="sales-report__vessel-plan muted">
          из {planTotal > 0 ? formatRub(planTotal) : '—'}
        </p>
        <p className="sales-report__vessel-pct">{planTotal > 0 ? `${pct} %` : '—'}</p>
      </div>
    </div>
  )
}
