import { useMemo } from 'react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { buildSegmentDailyComparableSeries } from '../lib/admin/salesPlanMatrixCompare.js'

/** @typedef {'count'|'amount'|'avg'} SegmentMetricId */

const METRIC_META = /** @type {const} */ ({
  amount: {
    label: 'Сумма',
    short: '₽',
    indexKey: 'index_amount',
    color: '#34d399',
    barClass: 'sales-segment-pace-chart__line--amount',
  },
  count: {
    label: 'Количество',
    short: 'шт',
    indexKey: 'index_count',
    color: '#60a5fa',
    barClass: 'sales-segment-pace-chart__line--count',
  },
  avg: {
    label: 'Ср. чек',
    short: '₽/чел',
    indexKey: 'index_avg',
    color: '#c4b5fd',
    barClass: 'sales-segment-pace-chart__line--avg',
  },
})

const PAD = { top: 14, right: 10, bottom: 26, left: 36 }

/**
 * @param {number} value
 * @param {SegmentMetricId} kind
 */
function formatFactValue(value, kind) {
  const n = Number(value) || 0
  if (kind === 'count') return `${Math.round(n)} шт`
  return formatRub(n)
}

/**
 * @param {{
 *   dailySeries: Array<{ date: string, count: number | null, amount: number | null, hasReport: boolean }>,
 *   activeMetricIds: SegmentMetricId[],
 *   plan?: { count?: number, amount?: number, avg_check?: number },
 *   daysInMonth?: number,
 *   onDayClick?: (iso: string) => void,
 *   fullscreen?: boolean,
 * }} props
 */
export function SalesSegmentComparablePaceChart({
  dailySeries,
  activeMetricIds,
  plan,
  daysInMonth,
  onDayClick,
  fullscreen = false,
}) {
  const metrics = activeMetricIds.filter((id) => METRIC_META[id])

  const comparable = useMemo(
    () => buildSegmentDailyComparableSeries(dailySeries, { plan, daysInMonth: daysInMonth ?? dailySeries.length }),
    [dailySeries, plan, daysInMonth],
  )

  const normBasis = comparable.find((d) => d.norm_basis)?.norm_basis ?? 'flat_month'

  const { chartMaxY, pointsByMetric } = useMemo(() => {
    /** @type {Record<string, Array<{ x: number, y: number | null, day: Record<string, unknown> }>>} */
    const byMetric = {}
    let maxY = 100
    for (const id of metrics) {
      byMetric[id] = []
    }
    comparable.forEach((day, idx) => {
      for (const id of metrics) {
        const key = METRIC_META[id].indexKey
        const yVal = day.hasReport ? Number(day[key]) : null
        if (yVal != null && Number.isFinite(yVal)) maxY = Math.max(maxY, yVal)
        byMetric[id].push({ x: idx, y: yVal, day })
      }
    })
    const niceMax = maxY <= 100 ? 100 : maxY <= 150 ? 150 : Math.ceil(maxY / 50) * 50
    return { chartMaxY: Math.min(300, niceMax), pointsByMetric: byMetric }
  }, [comparable, metrics])

  const dayWidth = fullscreen ? 30 : 22
  const plotW = Math.max(comparable.length * dayWidth, fullscreen ? 720 : 280)
  const plotH = fullscreen
    ? Math.max(300, Math.min(520, Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.42)))
    : 160
  const pad = fullscreen
    ? { top: 18, right: 14, bottom: 32, left: 44 }
    : PAD
  const width = pad.left + plotW + pad.right
  const height = pad.top + plotH + pad.bottom

  const yPos = (pct) => pad.top + plotH - (pct / chartMaxY) * plotH
  const xPos = (idx) => pad.left + (idx + 0.5) * (plotW / Math.max(comparable.length, 1))

  const yTicks = chartMaxY <= 100 ? [0, 50, 100] : chartMaxY <= 150 ? [0, 50, 100, 150] : [0, 50, 100, 150, chartMaxY]

  if (!comparable.length || !metrics.length) {
    return (
      <p className="muted sales-report__stats-empty" role="status">
        Выберите хотя бы один показатель.
      </p>
    )
  }

  return (
    <div className={`sales-segment-pace-chart${fullscreen ? ' sales-segment-pace-chart--fullscreen' : ''}`}>
      <div className="sales-segment-pace-chart__legend" aria-label="Легенда">
        {metrics.map((id) => (
          <span key={id} className={`sales-segment-pace-chart__legend-item ${METRIC_META[id].barClass}`}>
            <span className="sales-segment-pace-chart__legend-line" aria-hidden />
            {METRIC_META[id].label}
          </span>
        ))}
        <span className="sales-segment-pace-chart__legend-note muted">
          Ось: % от {normBasis === 'plan' ? 'дневной нормы плана' : 'равномерного темпа месяца'}. Линия 100% — норма на день.
        </span>
      </div>

      <div
        className={`sales-column-chart__scroll sales-segment-pace-chart__scroll${fullscreen ? ' sales-segment-pace-chart__scroll--fullscreen' : ''}`}
      >
        <svg
          className="sales-segment-pace-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Сравнение показателей по дням в процентах от дневной нормы"
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={yPos(tick)}
                x2={pad.left + plotW}
                y2={yPos(tick)}
                className={`sales-segment-pace-chart__grid${tick === 100 ? ' sales-segment-pace-chart__grid--norm' : ''}`}
              />
              <text
                x={pad.left - 8}
                y={yPos(tick) + 4}
                className={`sales-segment-pace-chart__ylabel${fullscreen ? ' sales-segment-pace-chart__ylabel--lg' : ''}`}
                textAnchor="end"
              >
                {tick}%
              </text>
              {tick === 100 ? (
                <text
                  x={pad.left + plotW + 6}
                  y={yPos(100) + 4}
                  className={`sales-segment-pace-chart__norm-tag${fullscreen ? ' sales-segment-pace-chart__norm-tag--lg' : ''}`}
                >
                  норма
                </text>
              ) : null}
            </g>
          ))}

          {metrics.map((id) => {
            const pts = pointsByMetric[id] ?? []
            const segments = []
            let current = []
            for (const p of pts) {
              if (p.y == null || !p.day.hasReport) {
                if (current.length >= 2) segments.push(current)
                current = []
                continue
              }
              current.push(p)
            }
            if (current.length >= 2) segments.push(current)
            if (current.length === 1) segments.push(current)

            return (
              <g key={id} className={METRIC_META[id].barClass}>
                {segments.map((seg, si) => {
                  const d = seg
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.x).toFixed(1)} ${yPos(p.y).toFixed(1)}`)
                    .join(' ')
                  return (
                    <path
                      key={`${id}-seg-${si}`}
                      d={d}
                      className="sales-segment-pace-chart__path"
                      fill="none"
                      stroke={METRIC_META[id].color}
                      strokeWidth={fullscreen ? 3 : 2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                })}
                {pts.map((p) => {
                  if (p.y == null || !p.day.hasReport) return null
                  const dayNum = Number(String(p.day.date).slice(8, 10)) || p.x + 1
                  const factKey = id === 'count' ? 'count' : id === 'amount' ? 'amount' : 'avg'
                  const title = `${dayNum}: ${METRIC_META[id].label} ${Math.round(p.y)}% (${formatFactValue(p.day[factKey], id)})`
                  return (
                    <circle
                      key={`${id}-dot-${p.x}`}
                      cx={xPos(p.x)}
                      cy={yPos(p.y)}
                      r={fullscreen ? 5 : 3.5}
                      className="sales-segment-pace-chart__dot"
                      stroke={METRIC_META[id].color}
                      fill="#0f172a"
                    >
                      <title>{title}</title>
                    </circle>
                  )
                })}
              </g>
            )
          })}

          {comparable.map((day, idx) => {
            const dayNum = Number(day.date.slice(8, 10)) || idx + 1
            const clickable = day.hasReport && onDayClick
            return (
              <g key={day.date}>
                <text
                  x={xPos(idx)}
                  y={height - 10}
                  className={`sales-segment-pace-chart__xlabel${day.hasReport ? ' is-active' : ''}${fullscreen ? ' sales-segment-pace-chart__xlabel--lg' : ''}`}
                  textAnchor="middle"
                >
                  {dayNum}
                </text>
                {clickable ? (
                  <rect
                    x={xPos(idx) - 10}
                    y={pad.top}
                    width={fullscreen ? 26 : 20}
                    height={plotH}
                    className="sales-segment-pace-chart__hit"
                    onClick={() => onDayClick?.(day.date)}
                    role="presentation"
                  />
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="sales-segment-pace-chart__summary">
        {metrics.map((id) => {
          const reported = comparable.filter((d) => d.hasReport && d[METRIC_META[id].indexKey] != null)
          const avgIndex =
            reported.length > 0
              ? reported.reduce((s, d) => s + Number(d[METRIC_META[id].indexKey]), 0) / reported.length
              : 0
          let peak = null
          let peakVal = 0
          for (const d of reported) {
            const v = Number(d[METRIC_META[id].indexKey]) || 0
            if (v > peakVal) {
              peakVal = v
              peak = d
            }
          }
          return (
            <p key={id} className="muted sales-segment-pace-chart__summary-line">
              <span className={`sales-segment-pace-chart__badge ${METRIC_META[id].barClass}`}>
                {METRIC_META[id].short}
              </span>
              ср. индекс <strong>{Math.round(avgIndex)}%</strong>
              {peak ? (
                <>
                  {' · '}
                  пик <strong>{Number(peak.date.slice(8, 10))}</strong> ({Math.round(peakVal)}%)
                </>
              ) : null}
            </p>
          )
        })}
      </div>
    </div>
  )
}
