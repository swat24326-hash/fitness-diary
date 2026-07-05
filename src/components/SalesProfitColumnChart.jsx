import { useMemo } from 'react'
import { formatRub } from '../lib/admin/salesReportCore.js'

/** Палитра столбцов — разноцветно, в духе FIT-CITY (тёмная тема). */
const BAR_PALETTE = [
  '#2dd4bf',
  '#4ade80',
  '#fbbf24',
  '#60a5fa',
  '#f87171',
  '#a78bfa',
  '#facc15',
  '#fb923c',
  '#34d399',
  '#38bdf8',
  '#86efac',
]

function chartMaxValue(max) {
  const n = Number(max) || 0
  if (n <= 0) return 5
  const exp = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / exp
  let nice = 10
  if (f <= 1) nice = 1
  else if (f <= 2) nice = 2
  else if (f <= 5) nice = 5
  return nice * exp
}

function yTicks(chartMax, steps = 4) {
  const out = []
  for (let i = steps; i >= 0; i -= 1) {
    out.push(Math.round((chartMax * i) / steps))
  }
  return out
}

function formatAxisRub(amount) {
  const n = Number(amount) || 0
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${Math.round((n / 1000) * 10) / 10}K`
  return String(Math.round(n))
}

/**
 * @param {{
 *   series: Array<{ date: string, profit: number | null, hasReport: boolean }>,
 *   onDayClick?: (iso: string) => void,
 * }} props
 */
export function SalesProfitColumnChart({ series, onDayClick }) {
  const { chartMax, ticks, total, hasAny, peakDate } = useMemo(() => {
    let max = 0
    let sum = 0
    let peak = null
    let peakN = 0
    for (const d of series ?? []) {
      const n = d.hasReport ? Number(d.profit) || 0 : 0
      sum += n
      if (n > max) max = n
      if (n > peakN) {
        peakN = n
        peak = d.date
      }
    }
    const cm = chartMaxValue(max)
    return { chartMax: cm, ticks: yTicks(cm), total: sum, hasAny: sum > 0, peakDate: peakN > 0 ? peak : null }
  }, [series])

  if (!series?.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Нет данных за месяц.
      </p>
    )
  }

  return (
    <div className="sales-column-chart">
      <div className="sales-column-chart__canvas">
        <div className="sales-column-chart__plot" role="img" aria-label="Прибыль по дням месяца">
          <div className="sales-column-chart__y-axis" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="sales-column-chart__y-label">
                {formatAxisRub(t)}
              </span>
            ))}
          </div>

          <div className="sales-column-chart__scroll">
            <div
              className="sales-column-chart__cols"
              style={{ '--chart-max': String(chartMax), '--chart-cols': String(series.length) }}
            >
              {ticks.map((t) => (
                <div
                  key={`grid-${t}`}
                  className="sales-column-chart__grid-line"
                  style={{ bottom: `${chartMax ? (t / chartMax) * 100 : 0}%` }}
                />
              ))}

              {series.map((d, idx) => {
                const n = d.hasReport ? Number(d.profit) || 0 : 0
                const hPct = chartMax && d.hasReport ? Math.min(100, (n / chartMax) * 100) : 0
                const isPeak = peakDate === d.date && n > 0
                const dayNum = Number(d.date.slice(8, 10)) || idx + 1
                const color = BAR_PALETTE[idx % BAR_PALETTE.length]
                const clickable = d.hasReport && onDayClick
                const title = d.hasReport ? `${dayNum}: ${formatRub(n)}` : `${dayNum}: нет отчёта`

                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`sales-column-chart__col-wrap${d.hasReport ? ' is-active' : ''}${isPeak ? ' is-peak' : ''}`}
                    title={title}
                    disabled={!clickable}
                    onClick={() => clickable && onDayClick?.(d.date)}
                    aria-label={title}
                  >
                    <div className="sales-column-chart__col-area">
                      {n > 0 ? (
                        <span className="sales-column-chart__col-value" aria-hidden>
                          {formatAxisRub(n)}
                        </span>
                      ) : null}
                      <div
                        className={`sales-column-chart__col${d.hasReport ? ' is-filled' : ' is-empty'}${isPeak ? ' is-peak' : ''}`}
                        style={{
                          height: d.hasReport ? `${Math.max(hPct, n > 0 ? 5 : 0)}%` : '3px',
                          ...(d.hasReport && n > 0 ? { '--col-color': color } : {}),
                        }}
                      />
                    </div>
                    <span
                      className={`sales-column-chart__col-label${d.hasReport ? ' is-active' : ''}${isPeak ? ' is-peak' : ''}`}
                    >
                      {dayNum}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {hasAny ? (
        <p className="muted sales-column-chart__sum">
          Итого на графике: <strong className="sales-column-chart__sum-val">{formatRub(total)}</strong>
        </p>
      ) : (
        <p className="muted sales-column-chart__sum">Нет сохранённых отчётов за этот месяц.</p>
      )}
    </div>
  )
}
