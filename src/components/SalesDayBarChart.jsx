import { formatDateRu } from '../lib/dateRu'

/**
 * @param {{
 *   series: Array<{ date: string, value: number | null, hasReport: boolean }>,
 *   maxValue: number,
 *   onDayClick?: (iso: string) => void,
 *   formatValue?: (n: number) => string,
 *   ariaLabel?: string,
 *   barClassName?: string,
 * }} props
 */
export function SalesDayBarChart({
  series,
  maxValue,
  onDayClick,
  formatValue = (n) => String(n),
  ariaLabel = 'Показатель по дням месяца',
  barClassName = '',
}) {
  if (!series.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Нет данных за месяц.
      </p>
    )
  }

  const max = Math.max(Number(maxValue) || 0, 1)

  return (
    <div className="sales-report__profit-chart" role="list" aria-label={ariaLabel}>
      {series.map((d) => {
        const value = d.value ?? 0
        const pct = d.hasReport ? Math.min(100, Math.round((value / max) * 100)) : 0
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
                  ? `${formatDateRu(d.date)}: ${formatValue(value)}`
                  : `${formatDateRu(d.date)}: нет отчёта`
              }
              aria-label={
                d.hasReport
                  ? `${formatDateRu(d.date)}, ${formatValue(value)}`
                  : `${formatDateRu(d.date)}, отчёт не заполнен`
              }
            >
              <span
                className={`sales-report__profit-chart-bar${barClassName ? ` ${barClassName}` : ''}`}
                style={{ width: d.hasReport ? `${Math.max(pct, value > 0 ? 4 : 0)}%` : '0%' }}
              />
            </button>
            <span className="sales-report__profit-chart-value">
              {d.hasReport ? formatValue(value) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
