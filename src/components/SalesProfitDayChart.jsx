import { formatDateRu } from '../lib/dateRu'
import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {{
 *   series: Array<{ date: string, profit: number | null, hasReport: boolean }>,
 *   maxProfit: number,
 *   onDayClick?: (iso: string) => void,
 * }} props
 */
export function SalesProfitDayChart({ series, maxProfit, onDayClick }) {
  if (!series.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Нет данных за месяц.
      </p>
    )
  }

  const max = Math.max(Number(maxProfit) || 0, 1)

  return (
    <div className="sales-report__profit-chart" role="list" aria-label="Прибыль по дням месяца">
      {series.map((d) => {
        const profit = d.profit ?? 0
        const pct = d.hasReport ? Math.min(100, Math.round((profit / max) * 100)) : 0
        const dayNum = Number(d.date.slice(8, 10)) || 0
        const clickable = d.hasReport && onDayClick

        return (
          <div
            key={d.date}
            className={`sales-report__profit-chart-row${d.hasReport ? ' has-data' : ''}`}
            role="listitem"
          >
            <span className="sales-report__profit-chart-day muted">{dayNum}</span>
            <button
              type="button"
              className="sales-report__profit-chart-bar-wrap"
              disabled={!clickable}
              onClick={() => clickable && onDayClick?.(d.date)}
              title={
                d.hasReport
                  ? `${formatDateRu(d.date)}: ${formatRub(profit)}`
                  : `${formatDateRu(d.date)}: нет отчёта`
              }
              aria-label={
                d.hasReport
                  ? `${formatDateRu(d.date)}, ${formatRub(profit)}`
                  : `${formatDateRu(d.date)}, отчёт не заполнен`
              }
            >
              <span
                className="sales-report__profit-chart-bar"
                style={{ width: d.hasReport ? `${Math.max(pct, profit > 0 ? 4 : 0)}%` : '0%' }}
              />
            </button>
            <span className="sales-report__profit-chart-value">
              {d.hasReport ? formatRub(profit) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
