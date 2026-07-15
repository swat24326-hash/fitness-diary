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
 * @param {number} value
 * @param {'count'|'amount'|'avg'} kind
 * @param {number} monthTotal
 * @param {boolean} showShare
 */
function formatDayBarLabel(value, kind, monthTotal, showShare) {
  const n = Number(value) || 0
  const base = kind === 'count' ? String(Math.round(n)) : formatAxisValue(n, kind)
  if (!showShare || monthTotal <= 0 || n <= 0) return base
  const share = Math.round((n / monthTotal) * 100)
  return `${base} · ${share}%`
}

const METRIC_COLORS = /** @type {const} */ ({
  amount: 'linear-gradient(180deg, #047857, #34d399)',
  count: 'linear-gradient(180deg, #1d4ed8, #60a5fa)',
  avg: 'linear-gradient(180deg, #7c3aed, #c4b5fd)',
})

/**
 * @param {{
 *   series: Array<{ date: string, value: number | null, hasReport: boolean }>,
 *   metricKind?: 'count'|'amount'|'avg',
 *   colSuffix?: string,
 *   onDayClick?: (iso: string) => void,
 *   compact?: boolean,
 *   fullscreen?: boolean,
 *   stacked?: boolean,
 *   planLine?: number | null,
  planLabel?: string,
}} props
 */
export function SalesSegmentMetricColumnChart({
  series,
  metricKind = 'amount',
  colSuffix = 'nk',
  onDayClick,
  compact = false,
  fullscreen = false,
  stacked = false,
  planLine = null,
  planLabel = '',
}) {
  const plotHeight = fullscreen ? (stacked ? 168 : 260) : compact ? 120 : 176

  const barColor = useMemo(() => {
    if (METRIC_COLORS[metricKind]) return METRIC_COLORS[metricKind]
    if (colSuffix === 'dk') return 'linear-gradient(180deg, #2563b8, #9ec9ff)'
    if (colSuffix === 'uk') return 'linear-gradient(180deg, #6b21a8, #e0b0ff)'
    return 'linear-gradient(180deg, #047857, #7ee8c6)'
  }, [colSuffix, metricKind])

  const stats = useMemo(() => {
    let max = 0
    let sum = 0
    let peak = null
    let peakN = 0
    let low = null
    let lowN = Infinity
    let reportDays = 0
    let salesDays = 0
    let daysAtOrAbovePlan = 0
    const planNorm = Number(planLine) > 0 ? Number(planLine) : null

    for (const d of series ?? []) {
      const n = d.hasReport ? Number(d.value) || 0 : 0
      if (d.hasReport) {
        reportDays += 1
        sum += n
        if (n > 0) salesDays += 1
        if (planNorm != null && n >= planNorm) daysAtOrAbovePlan += 1
      }
      if (n > max) max = n
      if (n > peakN) {
        peakN = n
        peak = d.date
      }
      if (d.hasReport && n > 0 && n < lowN) {
        lowN = n
        low = d.date
      }
    }

    if (planNorm != null) max = Math.max(max, planNorm)
    const cm = chartMaxValue(max)
    return {
      chartMax: cm,
      ticks: yTicks(cm),
      total: sum,
      hasAny: salesDays > 0,
      reportDays,
      salesDays,
      peakDate: peakN > 0 ? peak : null,
      peakValue: peakN,
      lowDate: lowN < Infinity ? low : null,
      lowValue: lowN < Infinity ? lowN : null,
      avgPerSalesDay: salesDays > 0 ? sum / salesDays : 0,
      planNorm,
      daysAtOrAbovePlan,
    }
  }, [series, planLine])

  if (!series?.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Нет данных за месяц.
      </p>
    )
  }

  const showShare = fullscreen && stats.total > 0
  const planBottomPx =
    stats.planNorm != null && stats.chartMax > 0
      ? 24 + Math.round((stats.planNorm / stats.chartMax) * plotHeight)
      : null

  return (
    <div
      className={`sales-segment-column-chart sales-segment-column-chart--${metricKind}${compact ? ' sales-segment-column-chart--compact' : ''}${fullscreen ? ' sales-segment-column-chart--fullscreen' : ''}${stacked ? ' sales-segment-column-chart--stacked' : ''}`}
    >
      <div className="sales-column-chart__canvas">
        <div className="sales-column-chart__plot" role="img" aria-label="Продажи сегмента по дням месяца">
          <div className="sales-column-chart__y-axis" aria-hidden>
            {stats.ticks.map((t) => (
              <span key={t} className="sales-column-chart__y-label">
                {formatAxisValue(t, metricKind)}
              </span>
            ))}
          </div>

          <div className="sales-column-chart__scroll">
            <div
              className="sales-column-chart__cols sales-segment-column-chart__cols"
              style={{
                '--chart-max': String(stats.chartMax),
                '--chart-cols': String(series.length),
                '--plot-height': `${plotHeight}px`,
              }}
            >
              {stats.ticks.map((t) => (
                <div
                  key={`grid-${t}`}
                  className="sales-column-chart__grid-line"
                  style={{ bottom: `${stats.chartMax ? (t / stats.chartMax) * 100 : 0}%` }}
                />
              ))}

              {planBottomPx != null ? (
                <div
                  className="sales-segment-column-chart__plan-line"
                  style={{ bottom: `${planBottomPx}px` }}
                  title={planLabel || `План: ${formatBarValue(stats.planNorm, metricKind)}`}
                  aria-hidden
                >
                  <span className="sales-segment-column-chart__plan-line-label">
                    {metricKind === 'avg' ? 'план чека' : 'план'}
                  </span>
                </div>
              ) : null}

              {series.map((d, idx) => {
                const n = d.hasReport ? Number(d.value) || 0 : 0
                const barPx =
                  stats.chartMax > 0 && d.hasReport && n > 0
                    ? Math.max(Math.round((n / stats.chartMax) * plotHeight), 10)
                    : 0
                const isPeak = stats.peakDate === d.date && n > 0
                const isLow = stats.lowDate === d.date && n > 0 && stats.salesDays > 1
                const isAbovePlan =
                  stats.planNorm != null && d.hasReport && n >= stats.planNorm && n > 0
                const dayNum = Number(d.date.slice(8, 10)) || idx + 1
                const clickable = d.hasReport && onDayClick
                const title = d.hasReport
                  ? `${dayNum}: ${formatBarValue(n, metricKind)}${showShare && n > 0 ? ` (${Math.round((n / stats.total) * 100)}% месяца)` : ''}${isAbovePlan ? ' · план выполнен' : stats.planNorm != null && n > 0 ? ' · ниже плана' : ''}`
                  : `${dayNum}: нет отчёта`

                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`sales-column-chart__col-wrap${d.hasReport ? ' is-active' : ''}${isPeak ? ' is-peak' : ''}${isLow ? ' is-low' : ''}${isAbovePlan ? ' is-above-plan' : ''}`}
                    title={title}
                    disabled={!clickable}
                    onClick={() => clickable && onDayClick?.(d.date)}
                    aria-label={title}
                  >
                    <div className="sales-column-chart__col-area">
                      {n > 0 ? (
                        <span className="sales-column-chart__col-value" aria-hidden>
                          {formatDayBarLabel(n, metricKind, stats.total, showShare)}
                        </span>
                      ) : null}
                      <div
                        className={`sales-column-chart__col sales-segment-column-chart__col${d.hasReport ? ' is-filled' : ' is-empty'}${isPeak ? ' is-peak' : ''}${isLow ? ' is-low' : ''}`}
                        style={{
                          height: d.hasReport ? (n > 0 ? `${barPx}px` : '3px') : '3px',
                          ...(d.hasReport && n > 0 ? { background: barColor } : {}),
                        }}
                      />
                    </div>
                    <span
                      className={`sales-column-chart__col-label${d.hasReport ? ' is-active' : ''}${isPeak ? ' is-peak' : ''}${isLow ? ' is-low' : ''}`}
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

      {stats.hasAny || stats.planNorm != null ? (
        <p className="muted sales-segment-column-chart__foot">
          {stats.planNorm != null ? (
            <>
              {metricKind === 'avg' ? 'уровень плана' : 'план на день'}:{' '}
              <strong>{formatBarValue(stats.planNorm, metricKind)}</strong>
              {' · '}
              дней ≥ плана: <strong>{stats.daysAtOrAbovePlan}</strong>
              {stats.reportDays > 0 ? (
                <>
                  {' '}
                  из <strong>{stats.reportDays}</strong>
                </>
              ) : null}
              {stats.hasAny ? ' · ' : null}
            </>
          ) : null}
          {stats.hasAny ? (
            <>
              Итого: <strong>{formatBarValue(stats.total, metricKind)}</strong>
              {' · '}
              ср. в день с продажами: <strong>{formatBarValue(stats.avgPerSalesDay, metricKind)}</strong>
              {stats.peakDate ? (
                <>
                  {' · '}
                  макс.: <strong>{Number(stats.peakDate.slice(8, 10))}</strong> (
                  {formatBarValue(stats.peakValue, metricKind)})
                </>
              ) : null}
              {stats.lowDate && metricKind === 'avg' ? (
                <>
                  {' · '}
                  мин.: <strong>{Number(stats.lowDate.slice(8, 10))}</strong> (
                  {formatBarValue(stats.lowValue, metricKind)})
                </>
              ) : null}
            </>
          ) : null}
        </p>
      ) : (
        <p className="muted sales-segment-column-chart__foot">Нет дней с продажами в этом сегменте.</p>
      )}
    </div>
  )
}
