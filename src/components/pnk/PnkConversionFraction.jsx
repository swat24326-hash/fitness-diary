/**
 * Компактный KPI: оформлено / ПНК и маленький %.
 */
export function PnkConversionFraction({ entered = 0, won = 0, label = 'ПНК → ДК', className = '' }) {
  const e = Math.max(0, Number(entered) || 0)
  const w = Math.max(0, Number(won) || 0)
  const pct = e > 0 ? Math.round((w / e) * 1000) / 10 : 0
  return (
    <div className={`pnk-conversion-fraction${className ? ` ${className}` : ''}`} aria-label={`${label}: ${w} из ${e}, ${pct}%`}>
      <span className="pnk-conversion-fraction__label">{label}</span>
      <span className="pnk-conversion-fraction__value">
        {w}/{e}
        <span className="pnk-conversion-fraction__pct">{pct}%</span>
      </span>
    </div>
  )
}
