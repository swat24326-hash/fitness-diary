import { useMemo } from 'react'
import {
  buildAdminClubMonthlyChartModel,
  monthLabelAxis,
  monthLabelRu,
} from '../lib/admin/adminClubMonthlyChartCore.js'
import { todayInTimeZoneIso } from '../lib/dateRu'

/**
 * @param {{
 *   rows: Array<{ month: string, count: number }>,
 *   year?: number,
 *   yearPicker?: import('react').ReactNode,
 * }} props
 */
export function AdminClubMonthlyChart({ rows, year, yearPicker = null }) {
  const list = Array.isArray(rows) ? rows : []
  const todayIso = todayInTimeZoneIso()

  const model = useMemo(
    () => buildAdminClubMonthlyChartModel(list, { todayIso }),
    [list, todayIso],
  )
  const { chartMax, ticks, total, hasAny, peakMonth, avgCount, currentMonth, avgBottomPct } = model

  if (!list.length) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Нет данных.
      </p>
    )
  }

  return (
    <div className="admin-monthly-chart">
      {!hasAny ? (
        <p className="muted admin-monthly-chart__empty-hint">
          За {year ? `${year} год` : '12 месяцев'} нет завершённых тренировок <strong>с типом карты</strong> (см. подпись ниже).
          Столбцы показаны для ориентира.
        </p>
      ) : null}

      <div className="admin-monthly-chart__canvas">
        <div className="admin-monthly-chart__plot" role="img" aria-label="График завершённых тренировок по месяцам">
          <div className="admin-monthly-chart__y-axis" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="admin-monthly-chart__y-label">
                {t}
              </span>
            ))}
          </div>

          <div className="admin-monthly-chart__scroll">
            <div
              className="admin-monthly-chart__cols"
              style={{ '--monthly-chart-max': String(chartMax), '--monthly-cols': String(list.length) }}
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
                  title={`Средняя по месяцам с тренировками: ${avgCount}`}
                  aria-hidden
                />
              ) : null}

              {list.map((r) => {
                const n = Number(r?.count ?? 0) || 0
                const hPct = chartMax ? Math.min(100, (n / chartMax) * 100) : 0
                const isPeak = peakMonth === r.month && n > 0
                const isCurrent = Boolean(currentMonth) && r.month === currentMonth
                const title = [
                  `${monthLabelRu(r.month)}: ${n}`,
                  isCurrent ? 'текущий месяц' : '',
                  isPeak ? 'пик года' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
                const colClass = [
                  'admin-monthly-chart__col',
                  n > 0 ? 'admin-monthly-chart__col--filled' : 'admin-monthly-chart__col--zero',
                  isPeak ? 'admin-monthly-chart__col--peak' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    key={r.month}
                    className={`admin-monthly-chart__col-wrap${n > 0 ? ' admin-monthly-chart__col-wrap--active' : ''}`}
                    title={title}
                  >
                    <div className="admin-monthly-chart__col-area">
                      {n > 0 ? (
                        <span className="admin-monthly-chart__col-value" aria-hidden>
                          {n}
                        </span>
                      ) : null}
                      <div
                        className={colClass}
                        style={{ height: `${Math.max(hPct, n > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                    <span
                      className={[
                        'admin-monthly-chart__col-label',
                        n > 0 ? 'admin-monthly-chart__col-label--active' : '',
                        isPeak ? 'admin-monthly-chart__col-label--peak' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={monthLabelRu(r.month)}
                    >
                      {monthLabelAxis(r.month, year)}
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
          Всего за {year ? `${year} год` : 'период'} на графике:{' '}
          <strong className="admin-monthly-chart__sum-val">{total}</strong>
          {avgCount != null ? (
            <>
              {' '}
              · средняя по месяцам с тренировками:{' '}
              <strong className="admin-monthly-chart__sum-val">
                {Number(avgCount).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
              </strong>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
