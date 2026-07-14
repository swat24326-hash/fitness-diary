import { useMemo } from 'react'
import { formatRub } from '../lib/admin/salesReportCore.js'

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

/**
 * @param {number} amount
 * @param {'count'|'amount'|'avg'} kind
 */
function formatAxisValue(amount, kind) {
  const n = Number(amount) || 0
  if (kind === 'count') return String(Math.round(n))
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${Math.round((n / 1000) * 10) / 10}K`
  return String(Math.round(n))
}

/**
 * @param {number} value
 * @param {'count'|'amount'|'avg'} kind
 */
function formatBarValue(value, kind) {
  const n = Number(value) || 0
  if (kind === 'count') return String(Math.round(n))
  return formatRub(n)
}

/**
 * @param {{
 *   series: Array<{ date: string, value: number | null, hasReport: boolean }>,
 *   metricKind?: 'count'|'amount'|'avg',
 *   colSuffix?: string,
 *   onDayClick?: (iso: string) => void,
 *   compact?: boolean,
 * }} props
 */
export function SalesSegmentMetricColumnChart({
  series,
  metricKind = 'amount',
  colSuffix = 'nk',
  onDayClick,
  compact = false,
}) {
  const barColor = useMemo(() => {
    if (colSuffix === 'dk') return 'linear-gradient(180deg, #2563b8, #9ec9ff)'
    if (colSuffix === 'uk') return 'linear-gradient(180deg, #6b21a8, #e0b0ff)'
    return 'linear-gradient(180deg, #047857, #7ee8c6)'
  }, [colSuffix])

  const { chartMax, ticks, total, hasAny, peakDate, avgPerReportDay } = useMemo(() => {
    let max = 0
    let sum = 0
    let peak = null
    let peakN = 0
    let reportDays = 0
    for (const d of series ?? []) {
      const n = d.hasReport ? Number(d.value) || 0 : 0
      if (d.hasReport) {
        reportDays += 1
        sum += n
      }
      if (n > max) max = n
      if (n > peakN) {
        peakN = n
        peak = d.date
      }
    }
    const cm = chartMaxValue(max)
    return {
      chartMax: cm,
      ticks: yTicks(cm),
      total: sum,
      hasAny: reportDays > 0,
      peakDate: peakN > 0 ? peak : null,
      avgPerReportDay: reportDays > 0 ? sum / reportDays : 0,
    }
  }, [series])

  if (!series?.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Нет данных за месяц.
      </p>
    )
  }

  return (
    <div className={`sales-segment-column-chart${compact ? ' sales-segment-column-chart--compact' : ''}`}>
      <div className="sales-column-chart__canvas">
        <div className="sales-column-chart__plot" role="img" aria-label="Продажи сегмента по дням месяца">
          <div className="sales-column-chart__y-axis" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="sales-column-chart__y-label">
                {formatAxisValue(t, metricKind)}
              </span>
            ))}
          </div>

          <div className="sales-column-chart__scroll">
            <div
              className="sales-column-chart__cols sales-segment-column-chart__cols"
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
                const n = d.hasReport ? Number(d.value) || 0 : 0
                const hPct = chartMax && d.hasReport ? Math.min(100, (n / chartMax) * 100) : 0
                const isPeak = peakDate === d.date && n > 0
                const dayNum = Number(d.date.slice(8, 10)) || idx + 1
                const clickable = d.hasReport && onDayClick
                const title = d.hasReport
                  ? `${dayNum}: ${formatBarValue(n, metricKind)}`
                  : `${dayNum}: нет отчёта`

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
                          {formatAxisValue(n, metricKind)}
                        </span>
                      ) : null}
                      <div
                        className={`sales-column-chart__col sales-segment-column-chart__col${d.hasReport ? ' is-filled' : ' is-empty'}${isPeak ? ' is-peak' : ''}`}
                        style={{
                          height: d.hasReport ? `${Math.max(hPct, n > 0 ? 6 : 0)}%` : '3px',
                          ...(d.hasReport && n > 0 ? { background: barColor } : {}),
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
        <p className="muted sales-segment-column-chart__foot">
          На графике: <strong>{formatBarValue(total, metricKind)}</strong>
          {' · '}
          ср. за день с отчётом: <strong>{formatBarValue(avgPerReportDay, metricKind)}</strong>
          {peakDate ? (
            <>
              {' · '}
              пик: <strong>{Number(peakDate.slice(8, 10))}</strong> число
            </>
          ) : null}
        </p>
      ) : (
        <p className="muted sales-segment-column-chart__foot">Нет дней с продажами в этом сегменте.</p>
      )}
    </div>
  )
}
