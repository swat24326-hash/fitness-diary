import { useEffect, useMemo, useState } from 'react'
import { buildJarCoinLayout } from '../lib/admin/salesPlanJar.js'
import { formatRub, planProgressPercent } from '../lib/admin/salesReportCore.js'

function JarCoin({ coin, mounted, variant = 'inner' }) {
  const style = {
    left: `${coin.x}%`,
    top: `${coin.y}%`,
    '--coin-rot': `${coin.r ?? 0}deg`,
    '--coin-delay': `${mounted ? coin.delayMs ?? 0 : 0}ms`,
  }
  return (
    <span
      className={`sales-report__coin sales-report__coin--${variant}${mounted ? ' sales-report__coin--in' : ''}`}
      style={style}
      aria-hidden
    />
  )
}

/**
 * @param {{ fact: number, planTotal: number, pulseKey?: number }} props
 */
export function SalesPlanVessel({ fact, planTotal, pulseKey = 0 }) {
  const pct = planProgressPercent(fact, planTotal)
  const layout = useMemo(() => buildJarCoinLayout(pct), [pct])
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

  return (
    <div className="sales-report__vessel-wrap">
      <div
        className={`sales-report__jar-scene${layout.overflow ? ' sales-report__jar-scene--overflow' : ''}${pulse ? ' sales-report__jar-scene--pulse' : ''}`}
        aria-hidden
      >
        <svg className="sales-report__jar-svg" viewBox="0 0 120 150" role="presentation">
          <defs>
            <clipPath id="sales-jar-body-clip">
              <path d="M34 38 L34 128 Q34 142 60 142 Q86 142 86 128 L86 38 Z" />
            </clipPath>
            <linearGradient id="sales-jar-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </linearGradient>
          </defs>
          <path
            className="sales-report__jar-outline"
            d="M42 18 L42 28 L34 38 L34 128 Q34 142 60 142 Q86 142 86 128 L86 38 L78 28 L78 18 Q78 12 60 12 Q42 12 42 18 Z"
          />
          <path className="sales-report__jar-fill-glass" d="M36 40 L36 126 Q36 138 60 138 Q84 138 84 126 L84 40 Z" fill="url(#sales-jar-glass)" />
          <ellipse className="sales-report__jar-shine" cx="44" cy="52" rx="8" ry="16" />
        </svg>

        <div className="sales-report__jar-coins-clip">
          {layout.inner.map((coin) => (
            <JarCoin key={coin.id} coin={coin} mounted={mounted} variant="inner" />
          ))}
        </div>

        {layout.rim.map((coin) => (
          <JarCoin key={coin.id} coin={coin} mounted={mounted} variant="rim" />
        ))}
        {layout.spill.map((coin) => (
          <JarCoin key={coin.id} coin={coin} mounted={mounted} variant="spill" />
        ))}
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
