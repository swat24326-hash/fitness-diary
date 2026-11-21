import { useMemo, useState } from 'react'
import {
  buildAdminClubMonthlyChartModel,
  monthLabelAxisShort,
  monthLabelRu,
} from '../lib/admin/adminClubMonthlyChartCore.js'
import {
  clubMonthlySeriesDisplayValue,
  formatClubMonthlySeriesValue,
  pickClubMonthlySeries,
} from '../lib/admin/clubMonthlyYearSeriesCore.js'
import { todayInTimeZoneIso } from '../lib/dateRu'

/** @typedef {import('../lib/admin/clubMonthlyYearSeriesCore.js').ClubMonthlyMetricId} ClubMonthlyMetricId */

const METRIC_TABS = [
  { id: 'volume', label: 'Объём' },
  { id: 'attendance', label: 'Посещаемость' },
  { id: 'retentionM3', label: 'M+3' },
]

/**
 * @param {{
 *   rows?: Array<{ month: string, count: number }>,
 *   attendance?: Array<{ month: string, value: number | null }>,
 *   retentionM3?: Array<{ month: string, value: number | null }>,
 *   year?: number,
 *   yearPicker?: import('react').ReactNode,
 *   initialMetric?: ClubMonthlyMetricId,
 * }} props
 */
export function AdminClubMonthlyChart({
  rows,
  attendance = [],
  retentionM3 = [],
  year,
  yearPicker = null,
  initialMetric = 'volume',
}) {
  const [metric, setMetric] = useState(
    /** @type {ClubMonthlyMetricId} */ (initialMetric === 'attendance' || initialMetric === 'retentionM3' ? initialMetric : 'volume'),
  )
  const todayIso = todayInTimeZoneIso()

  const seriesRaw = useMemo(
    () => pickClubMonthlySeries(metric, { months: rows, attendance, retentionM3 }),
    [metric, rows, attendance, retentionM3],
  )

  const seriesDisplay = useMemo(
    () =>
      seriesRaw.map((r) => ({
        month: r.month,
        value: clubMonthlySeriesDisplayValue(metric, r.value),
      })),
    [seriesRaw, metric],
  )

  const model = useMemo(
    () =>
      buildAdminClubMonthlyChartModel(seriesDisplay, {
        todayIso,
        includeZeroInAvg: metric !== 'volume',
        forceMax: metric === 'retentionM3' ? 100 : null,
      }),
    [seriesDisplay, todayIso, metric],
  )
  const { chartMax, ticks, total, hasAny, peakMonth, avgCount, currentMonth, avgBottomPct } = model

  const formatTick = (t) => {
    if (metric === 'retentionM3') return `${Math.round(Number(t))}%`
    if (metric === 'attendance') {
      const n = Number(t)
      return Number.isInteger(n) ? String(n) : n.toFixed(1)
    }
    return String(t)
  }

  const sumLabel =
    metric === 'volume'
      ? `Всего за ${year ? `${year} год` : 'период'} на графике`
      : metric === 'attendance'
        ? `Средняя посещаемость за месяцы с данными (${year || 'год'})`
        : `Среднее M+3 за месяцы с данными (${year || 'год'})`

  const avgLabel =
    metric === 'volume'
      ? 'средняя по месяцам с тренировками'
      : metric === 'attendance'
        ? 'средняя трен./нед'
        : 'среднее удержание'

  if (!seriesDisplay.length) {
    return (
      <div className="os-empty-card" role="status">
        <p className="os-empty-card__title">Нет данных</p>
        <p className="os-empty-card__hint">За выбранный год пока нечего показать на графике.</p>
      </div>
    )
  }

  return (
    <div className={`admin-monthly-chart admin-monthly-chart--${metric}`}>
      <div className="admin-monthly-metric-tabs" role="tablist" aria-label="Показатель графика">
        {METRIC_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={metric === tab.id}
            className={`admin-monthly-metric-tabs__btn${metric === tab.id ? ' admin-monthly-metric-tabs__btn--active' : ''}`}
            onClick={() => setMetric(/** @type {ClubMonthlyMetricId} */ (tab.id))}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!hasAny ? (
        <p className="muted admin-monthly-chart__empty-hint">
          {metric === 'volume'
            ? `За ${year ? `${year} год` : '12 месяцев'} нет завершённых тренировок с типом карты (см. подпись ниже). Столбцы показаны для ориентира.`
            : metric === 'attendance'
              ? `За ${year ? `${year} год` : 'год'} пока нет данных посещаемости по месяцам.`
              : `За ${year ? `${year} год` : 'год'} M+3 ещё рано или нет зрелых когорт.`}
        </p>
      ) : null}

      <div className="admin-monthly-chart__canvas">
        <div
          className="admin-monthly-chart__plot"
          role="img"
          aria-label={
            metric === 'volume'
              ? 'График завершённых тренировок по месяцам'
              : metric === 'attendance'
                ? 'График посещаемости по месяцам'
                : 'График удержания M+3 по месяцам'
          }
        >
          <div className="admin-monthly-chart__y-axis" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="admin-monthly-chart__y-label">
                {formatTick(t)}
              </span>
            ))}
          </div>

          <div className="admin-monthly-chart__scroll">
            <div
              className="admin-monthly-chart__cols"
              style={{ '--monthly-chart-max': String(chartMax), '--monthly-cols': String(seriesDisplay.length) }}
            >
              {ticks.map((t) => (
                <div
                  key={`grid-${t}`}
                  className="admin-monthly-chart__grid-line"
                  style={{ bottom: `${chartMax ? (t / chartMax) * 100 : 0}%` }}
                />
              ))}

              {avgBottomPct != null ? (
                <div
                  className="admin-monthly-chart__avg-line"
                  style={{ bottom: `${avgBottomPct}%` }}
                  title={`${avgLabel}: ${formatClubMonthlySeriesValue(metric, avgCount)}`}
                  aria-hidden
                />
              ) : null}

              {seriesDisplay.map((r) => {
                const n = r.value
                const filled = n != null && Number.isFinite(n) && n > 0
                const hPct = filled && chartMax ? Math.min(100, (n / chartMax) * 100) : 0
                const isPeak = peakMonth === r.month && filled
                const isCurrent = Boolean(currentMonth) && r.month === currentMonth
                const labelVal = formatClubMonthlySeriesValue(metric, n)
                const title = [
                  `${monthLabelRu(r.month)}: ${labelVal}`,
                  isCurrent ? 'текущий месяц' : '',
                  isPeak ? 'пик года' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
                const colClass = [
                  'admin-monthly-chart__col',
                  filled ? 'admin-monthly-chart__col--filled' : 'admin-monthly-chart__col--zero',
                  isPeak ? 'admin-monthly-chart__col--peak' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    key={r.month}
                    className={`admin-monthly-chart__col-wrap${filled ? ' admin-monthly-chart__col-wrap--active' : ''}`}
                    title={title}
                  >
                    <div className="admin-monthly-chart__col-area">
                      {filled ? (
                        <span className="admin-monthly-chart__col-value" aria-hidden>
                          {labelVal}
                        </span>
                      ) : null}
                      <div
                        className={colClass}
                        style={{ height: `${Math.max(hPct, filled ? 6 : 0)}%` }}
                      />
                    </div>
                    <span
                      className={[
                        'admin-monthly-chart__col-label',
                        filled ? 'admin-monthly-chart__col-label--active' : '',
                        isPeak ? 'admin-monthly-chart__col-label--peak' : '',
                        isCurrent ? 'admin-monthly-chart__col-label--current' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={monthLabelRu(r.month)}
                    >
                      {monthLabelAxisShort(r.month, year)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        {yearPicker ? <div className="admin-monthly-chart__year-slot">{yearPicker}</div> : null}
      </div>

      {hasAny ? (
        <p className="muted admin-monthly-chart__sum">
          {metric === 'volume' ? (
            <>
              {sumLabel}:{' '}
              <strong className="admin-monthly-chart__sum-val">{Math.round(total)}</strong>
              {avgCount != null ? (
                <>
                  {' '}
                  · {avgLabel}:{' '}
                  <strong className="admin-monthly-chart__sum-val">
                    {formatClubMonthlySeriesValue(metric, avgCount)}
                  </strong>
                </>
              ) : null}
            </>
          ) : (
            <>
              {sumLabel}:{' '}
              <strong className="admin-monthly-chart__sum-val">
                {formatClubMonthlySeriesValue(metric, avgCount)}
              </strong>
            </>
          )}
        </p>
      ) : null}
    </div>
  )
}
