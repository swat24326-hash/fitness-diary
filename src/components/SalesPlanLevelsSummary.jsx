import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {{ level1?: number, level2?: number, level3?: number, achievedLevel?: number }} props
 */
export function SalesPlanLevelsSummary({ level1 = 0, level2 = 0, level3 = 0, achievedLevel = 0 }) {
  const items = [
    { n: 1, amount: Number(level1) || 0 },
    { n: 2, amount: Number(level2) || 0 },
    { n: 3, amount: Number(level3) || 0 },
  ]

  return (
    <div className="sales-report__plan-levels-grid" role="status" aria-label="Суммы планов по уровням">
      {items.map(({ n, amount }) => {
        const reached = achievedLevel >= n && amount > 0
        const isFinal = n === 3
        const className = [
          'sales-report__plan-level-chip',
          reached ? 'is-reached' : '',
          isFinal ? 'is-final' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={n} className={className}>
            <span className="sales-report__plan-level-chip-label">План {n}</span>
            <span className="sales-report__plan-level-chip-value">
              {amount > 0 ? formatRub(amount) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
