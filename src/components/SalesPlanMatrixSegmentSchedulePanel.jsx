import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BarChart3, Coins, Hash, Percent, X } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { SalesSegmentMetricColumnChart } from './SalesSegmentMetricColumnChart.jsx'

/** @typedef {'count'|'amount'|'avg'} SegmentMetricId */

const METRIC_OPTIONS = /** @type {const} */ ([
  { id: 'amount', label: 'Выручка', short: '₽', icon: Coins, chartTitle: 'Выручка по дням, ₽' },
  { id: 'count', label: 'Продажи', short: 'шт', icon: Hash, chartTitle: 'Продажи по дням, шт' },
  { id: 'avg', label: 'Ср. чек', short: '₽/чел', icon: Percent, chartTitle: 'Средний чек по дням, ₽' },
])

/**
 * @param {{
 *   label: string,
 *   hall?: string,
 *   col?: string,
 *   series: Array<{ date: string, count: number | null, amount: number | null, hasReport: boolean }>,
 *   onClose: () => void,
 *   onOpenDay?: (iso: string) => void,
 * }} props
 */
export function SalesPlanMatrixSegmentSchedulePanel({
  label,
  hall = '',
  col = '',
  series,
  onClose,
  onOpenDay,
}) {
  const [activeMetrics, setActiveMetrics] = useState(
    () => new Set(/** @type {SegmentMetricId[]} */ (['amount', 'count', 'avg'])),
  )

  const stats = useMemo(() => {
    const reported = series.filter((d) => d.hasReport)
    const totalCount = reported.reduce((s, d) => s + (Number(d.count) || 0), 0)
    const totalAmount = Math.round(reported.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100
    const reportDays = reported.length
    const daysWithSales = reported.filter((d) => (Number(d.count) || 0) > 0 || (Number(d.amount) || 0) > 0).length
    const avgCheck = totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : null

    let peakDate = null
    let peakAmount = 0
    for (const d of reported) {
      const amt = Number(d.amount) || 0
      if (amt > peakAmount) {
        peakAmount = amt
        peakDate = d.date
      }
    }

    return {
      totalCount,
      totalAmount,
      reportDays,
      daysWithSales,
      avgCheck,
      peakDate,
      peakAmount,
      peakDayNum: peakDate ? Number(peakDate.slice(8, 10)) : null,
    }
  }, [series])

  const metricSeries = useMemo(() => {
    /** @type {Record<SegmentMetricId, Array<{ date: string, value: number | null, hasReport: boolean }>>} */
    const out = { count: [], amount: [], avg: [] }
    for (const d of series) {
      const count = d.hasReport ? Number(d.count) || 0 : null
      const amount = d.hasReport ? Number(d.amount) || 0 : null
      const avg =
        d.hasReport && count != null && count > 0 && amount != null
          ? Math.round((amount / count) * 100) / 100
          : d.hasReport
            ? 0
            : null
      out.count.push({ date: d.date, value: count, hasReport: d.hasReport })
      out.amount.push({ date: d.date, value: amount, hasReport: d.hasReport })
      out.avg.push({ date: d.date, value: avg, hasReport: d.hasReport })
    }
    return out
  }, [series])

  const activeList = METRIC_OPTIONS.filter((m) => activeMetrics.has(m.id))
  const stackedCharts = activeList.length > 1

  /**
   * @param {SegmentMetricId} id
   */
  const toggleMetric = (id) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size <= 1) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllMetrics = () => {
    setActiveMetrics(new Set(['amount', 'count', 'avg']))
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const panel = (
    <div
      className="sales-report__segment-schedule-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`sales-report__segment-schedule sales-report__segment-schedule--fullscreen sales-report__segment-schedule--${col}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-segment-schedule-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sales-report__segment-schedule-head">
          <div className="sales-report__segment-schedule-titles">
            <p className="sales-report__segment-schedule-kicker">
              <BarChart3 size={14} aria-hidden />
              Факты по дням
            </p>
            <h4 className="sales-report__segment-schedule-title" id="sales-segment-schedule-title">
              <span className="sales-report__segment-schedule-hall">{String(label).split(' ')[0]}</span>
              <span className="sales-report__segment-schedule-col">{String(label).split(' ')[1]}</span>
              {hall ? <span className="sr-only"> ({hall})</span> : null}
            </h4>
          </div>
          <button
            type="button"
            className="sales-report__segment-schedule-close"
            onClick={onClose}
            aria-label="Закрыть график продаж"
          >
            <X size={18} aria-hidden />
            Закрыть
          </button>
        </header>

        {stats.reportDays > 0 ? (
          <div className="sales-report__segment-schedule-kpis" aria-label="Сводка за месяц">
            <div className="sales-report__segment-schedule-kpi">
              <span className="sales-report__segment-schedule-kpi-label">Итого, ₽</span>
              <strong className="sales-report__segment-schedule-kpi-value">{formatRub(stats.totalAmount)}</strong>
            </div>
            <div className="sales-report__segment-schedule-kpi">
              <span className="sales-report__segment-schedule-kpi-label">Итого, шт</span>
              <strong className="sales-report__segment-schedule-kpi-value">{stats.totalCount}</strong>
            </div>
            <div className="sales-report__segment-schedule-kpi">
              <span className="sales-report__segment-schedule-kpi-label">Ср. чек</span>
              <strong className="sales-report__segment-schedule-kpi-value">
                {stats.avgCheck != null ? formatRub(stats.avgCheck) : '—'}
              </strong>
            </div>
            <div className="sales-report__segment-schedule-kpi">
              <span className="sales-report__segment-schedule-kpi-label">Лучший день</span>
              <strong className="sales-report__segment-schedule-kpi-value">
                {stats.peakDayNum != null ? `${stats.peakDayNum} · ${formatRub(stats.peakAmount)}` : '—'}
              </strong>
            </div>
            <div className="sales-report__segment-schedule-kpi sales-report__segment-schedule-kpi--muted">
              <span className="sales-report__segment-schedule-kpi-label">Отчётов</span>
              <strong className="sales-report__segment-schedule-kpi-value">
                {stats.reportDays}
                {stats.daysWithSales < stats.reportDays ? ` · продаж ${stats.daysWithSales}` : ''}
              </strong>
            </div>
          </div>
        ) : (
          <p className="sales-report__segment-schedule-meta muted">Нет заполненных отчётов за этот сегмент.</p>
        )}

        <div className="sales-report__segment-schedule-toolbar">
          <div className="sales-report__segment-schedule-toolbar-row">
            <span className="sales-report__segment-schedule-toolbar-label">Показать графики</span>
            <button
              type="button"
              className={`sales-report__segment-schedule-all-btn${activeMetrics.size === 3 ? ' sales-report__segment-schedule-all-btn--on' : ''}`}
              onClick={selectAllMetrics}
              aria-pressed={activeMetrics.size === 3}
            >
              Все три
            </button>
          </div>
          <div className="sales-report__segment-schedule-toggles" role="group" aria-label="Показатели графика">
            {METRIC_OPTIONS.map((metric) => {
              const Icon = metric.icon
              const on = activeMetrics.has(metric.id)
              return (
                <button
                  key={metric.id}
                  type="button"
                  className={`sales-report__segment-schedule-toggle${on ? ' sales-report__segment-schedule-toggle--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleMetric(metric.id)}
                >
                  <Icon size={14} aria-hidden />
                  {metric.label}
                  <span className="sales-report__segment-schedule-toggle-unit">{metric.short}</span>
                </button>
              )
            })}
          </div>
          <p className="sales-report__segment-schedule-legend muted">
            Столбец — день месяца. Подпись на столбце — значение и доля от итога за месяц (%). Золотая обводка — лучший
            день, красная — самый слабый день по среднему чеку.
          </p>
        </div>

        {series.length && activeList.length ? (
          <div
            className={`sales-report__segment-schedule-charts sales-report__segment-schedule-charts--fullscreen${stackedCharts ? ' sales-report__segment-schedule-charts--facts-stack' : ''}`}
          >
            {activeList.map((metric) => (
              <div key={metric.id} className="sales-report__segment-schedule-chart">
                <h5 className="sales-report__segment-schedule-chart-title">{metric.chartTitle}</h5>
                <SalesSegmentMetricColumnChart
                  series={metricSeries[metric.id]}
                  metricKind={metric.id}
                  colSuffix={col}
                  onDayClick={onOpenDay}
                  fullscreen
                  stacked={stackedCharts}
                />
              </div>
            ))}
          </div>
        ) : null}

        {onOpenDay ? (
          <p className="muted sales-report__segment-schedule-hint">Нажмите на столбец дня — откроется отчёт за этот день.</p>
        ) : null}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
