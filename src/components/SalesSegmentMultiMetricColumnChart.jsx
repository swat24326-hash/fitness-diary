import { useMemo } from 'react'
import { formatRub } from '../lib/admin/salesReportCore.js'

/** @typedef {'count'|'amount'|'avg'} SegmentMetricId */

const METRIC_META = /** @type {const} */ ({
  amount: {
    label: 'Сумма',
    short: '₽',
    barClass: 'sales-segment-multi-chart__bar--amount',
  },
  count: {
    label: 'Количество',
    short: 'шт',
    barClass: 'sales-segment-multi-chart__bar--count',
  },
  avg: {
    label: 'Ср. чек',
    short: '₽/чел',
    barClass: 'sales-segment-multi-chart__bar--avg',
  },
})

/**
 * @param {number} value
 * @param {SegmentMetricId} kind
 */
function formatMetricValue(value, kind) {
  const n = Number(value) || 0
  if (kind === 'count') return `${Math.round(n)} шт`
  return formatRub(n)
}

/**
 * @param {Array<{ date: string, count: number | null, amount: number | null, hasReport: boolean }>} dailySeries
 * @param {SegmentMetricId} metricId
 */
function valuesForMetric(dailySeries, metricId) {
  return dailySeries.map((d) => {
    if (!d.hasReport) return { date: d.date, value: null, hasReport: false }
    const count = Number(d.count) || 0
    const amount = Number(d.amount) || 0
    if (metricId === 'count') return { date: d.date, value: count, hasReport: true }
    if (metricId === 'amount') return { date: d.date, value: amount, hasReport: true }
    const avg = count > 0 ? Math.round((amount / count) * 100) / 100 : 0
    return { date: d.date, value: avg, hasReport: true }
  })
}

/**
 * @param {{
 *   dailySeries: Array<{ date: string, count: number | null, amount: number | null, hasReport: boolean }>,
 *   activeMetricIds: SegmentMetricId[],
 *   onDayClick?: (iso: string) => void,
 * }} props
 */
export function SalesSegmentMultiMetricColumnChart({ dailySeries, activeMetricIds, onDayClick }) {
  const metrics = activeMetricIds.filter((id) => METRIC_META[id])

  const { maxByMetric, peakByMetric } = useMemo(() => {
    /** @type {Record<string, number>} */
    const maxBy = {}
    /** @type {Record<string, { date: string, value: number } | null>} */
    const peakBy = {}
    for (const id of metrics) {
      let max = 0
      let peak = null
      let peakVal = 0
      for (const row of valuesForMetric(dailySeries, id)) {
        const n = row.hasReport ? Number(row.value) || 0 : 0
        if (n > max) max = n
        if (n > peakVal) {
          peakVal = n
          peak = { date: row.date, value: n }
        }
      }
      maxBy[id] = max
      peakBy[id] = peakVal > 0 ? peak : null
    }
    return { maxByMetric: maxBy, peakByMetric: peakBy }
  }, [dailySeries, metrics])

  if (!dailySeries?.length || !metrics.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Выберите хотя бы один показатель.
      </p>
    )
  }

  return (
    <div className="sales-segment-multi-chart">
      <div className="sales-segment-multi-chart__legend" aria-label="Легенда показателей">
        {metrics.map((id) => (
          <span key={id} className={`sales-segment-multi-chart__legend-item ${METRIC_META[id].barClass}`}>
            <span className="sales-segment-multi-chart__legend-swatch" aria-hidden />
            {METRIC_META[id].label}, {METRIC_META[id].short}
          </span>
        ))}
        <span className="sales-segment-multi-chart__legend-note muted">
          Высота столбца — доля от лучшего дня месяца по этому показателю
        </span>
      </div>

      <div className="sales-column-chart__scroll sales-segment-multi-chart__scroll">
        <div
          className="sales-segment-multi-chart__days"
          style={{ '--multi-cols': String(dailySeries.length), '--metric-count': String(metrics.length) }}
        >
          {dailySeries.map((day, idx) => {
            const dayNum = Number(day.date.slice(8, 10)) || idx + 1
            const clickable = day.hasReport && onDayClick

            /** @type {string[]} */
            const tooltipParts = [`${dayNum} число`]
            if (!day.hasReport) tooltipParts.push('нет отчёта')
            else {
              for (const id of metrics) {
                const row = valuesForMetric([day], id)[0]
                tooltipParts.push(`${METRIC_META[id].label}: ${formatMetricValue(row.value, id)}`)
              }
            }
            const title = tooltipParts.join(' · ')

            return (
              <button
                key={day.date}
                type="button"
                className={`sales-segment-multi-chart__day${day.hasReport ? ' is-active' : ''}`}
                disabled={!clickable}
                onClick={() => clickable && onDayClick?.(day.date)}
                title={title}
                aria-label={title}
              >
                <div className="sales-segment-multi-chart__bars" aria-hidden>
                  {metrics.map((id) => {
                    const row = valuesForMetric([day], id)[0]
                    const n = row.hasReport ? Number(row.value) || 0 : 0
                    const max = maxByMetric[id] || 0
                    const hPct = max > 0 && row.hasReport ? Math.min(100, (n / max) * 100) : 0
                    const isPeak = peakByMetric[id]?.date === day.date && n > 0
                    return (
                      <div
                        key={id}
                        className={`sales-segment-multi-chart__bar ${METRIC_META[id].barClass}${row.hasReport && n > 0 ? ' is-filled' : ''}${isPeak ? ' is-peak' : ''}`}
                        style={{ height: row.hasReport && n > 0 ? `${Math.max(hPct, 8)}%` : '4px' }}
                      />
                    )
                  })}
                </div>
                <span className={`sales-segment-multi-chart__day-label${day.hasReport ? ' is-active' : ''}`}>
                  {dayNum}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="sales-segment-multi-chart__summary">
        {metrics.map((id) => {
          const rows = valuesForMetric(dailySeries, id).filter((r) => r.hasReport)
          const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0)
          const avg = rows.length ? total / rows.length : 0
          const peak = peakByMetric[id]
          return (
            <p key={id} className="muted sales-segment-multi-chart__summary-line">
              <span className={`sales-segment-multi-chart__summary-badge ${METRIC_META[id].barClass}`}>
                {METRIC_META[id].short}
              </span>
              итого <strong>{formatMetricValue(total, id)}</strong>
              {' · '}
              ср./день <strong>{formatMetricValue(avg, id)}</strong>
              {peak ? (
                <>
                  {' · '}
                  пик <strong>{Number(peak.date.slice(8, 10))}</strong> ({formatMetricValue(peak.value, id)})
                </>
              ) : null}
            </p>
          )
        })}
      </div>
    </div>
  )
}
