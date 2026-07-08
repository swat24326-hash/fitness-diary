import { useMemo } from 'react'
import { Target, TrendingUp } from 'lucide-react'
import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  buildClubFinanceForecast,
  daysInCalendarMonth,
} from '../lib/admin/clubFinanceForecastCore.js'
import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   monthRows: Array<Record<string, unknown>>,
 *   membershipTypes: Array<Record<string, unknown>>,
 *   planForm?: Record<string, string>,
 *   expense?: number,
 * }} props
 */
export function SalesFinanceForecast({ year, month, monthRows, membershipTypes, planForm = {}, expense = 0 }) {
  const forecast = useMemo(
    () =>
      buildClubFinanceForecast({
        monthRows,
        year,
        month,
        expense,
        membershipTypes,
        planForm,
      }),
    [monthRows, year, month, expense, membershipTypes, planForm],
  )

  if (!forecast.ok) {
    if (forecast.reason === 'not_current_month') {
      return (
        <p className="sales-finance-forecast__note sales-finance-forecast__note--info">
          Прогноз доступен только для текущего месяца — выбранный период уже закрыт или ещё не начался.
        </p>
      )
    }
    if (forecast.reason === 'insufficient_reports') {
      return (
        <p className="sales-finance-forecast__note sales-finance-forecast__note--info">
          Прогноз появится после {MIN_REPORT_DAYS_FOR_FORECAST} заполненных отчётов (сейчас{' '}
          {forecast.reportDays ?? 0}).
        </p>
      )
    }
    return null
  }

  const endDay = daysInCalendarMonth(year, month)
  const monthEndLabel = `${String(endDay).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`

  const rows = [
    { key: 'earnings', label: 'Заработок месяца', kind: 'money' },
    { key: 'refunds', label: 'Возвраты', kind: 'money', negative: true, static: true },
    { key: 'pzTrainings', label: 'Тренировки ПЗ', kind: 'count' },
    { key: 'azTrainings', label: 'Тренировки АЗ', kind: 'count' },
    { key: 'trainerPayroll', label: 'ЗП персонального зала', kind: 'money', negative: true },
    { key: 'aerobicPayroll', label: 'ЗП аэробного зала', kind: 'money', negative: true },
    { key: 'expense', label: 'Расход управляющего', kind: 'money', negative: true, static: true },
    { key: 'netProfit', label: 'Чистая прибыль', kind: 'money', primary: true },
  ]

  const formatValue = (kind, value, negative) => {
    if (kind === 'count') return new Intl.NumberFormat('ru-RU').format(value ?? 0)
    const n = Math.abs(Number(value) || 0)
    const text = formatRub(n)
    return negative ? `−${text}` : text
  }

  const formatReachLabel = (reach, planTarget) => {
    if (planTarget <= 0) return 'План не задан'
    if (reach.willReach) return `Прогноз: выполним план (${reach.forecastProgressPercent}%)`
    if (reach.gapRub > 0) {
      return `Прогноз: не дотянем (${reach.forecastProgressPercent}%, не хватает ${formatRub(reach.gapRub)})`
    }
    return `Прогноз: ${reach.forecastProgressPercent}%`
  }

  const plan = forecast.plan

  return (
    <section className="sales-finance-forecast" aria-labelledby="sales-finance-forecast-title">
      <header className="sales-finance-forecast__head">
        <h3 className="sales-finance-forecast__title" id="sales-finance-forecast-title">
          <TrendingUp size={20} aria-hidden className="sales-finance-forecast__title-icon" />
          Прогноз на {monthEndLabel}
        </h3>
        <p className="sales-finance-forecast__hint">
          Среднее за <strong>{forecast.reportDays}</strong> отчёт
          {forecast.reportDays === 1 ? '' : forecast.reportDays < 5 ? 'а' : 'ов'} ×{' '}
          <strong>{forecast.daysInMonth}</strong> дн. месяца
        </p>
      </header>

      {plan?.level3 > 0 ? (
        <div className="sales-finance-forecast__section">
          <h4 className="sales-finance-forecast__section-title">
            <Target size={17} aria-hidden className="sales-finance-forecast__section-icon" />
            План уровня 3
          </h4>
          <div className="sales-finance-forecast__plan-cards">
            <article className="sales-finance-forecast__plan-card">
              <span className="sales-finance-forecast__plan-kpi-label">Цель месяца</span>
              <strong className="sales-finance-forecast__plan-kpi-value">{formatRub(plan.level3)}</strong>
            </article>
            <article className="sales-finance-forecast__plan-card">
              <span className="sales-finance-forecast__plan-kpi-label">Факт сейчас</span>
              <strong className="sales-finance-forecast__plan-kpi-value">{plan.factProgressPercent}%</strong>
              <span className="sales-finance-forecast__plan-kpi-sub">{formatRub(plan.factGross)}</span>
            </article>
            <article className={`sales-finance-forecast__plan-card sales-finance-forecast__plan-card--${plan.reach.tone}`}>
              <span className="sales-finance-forecast__plan-kpi-label">Прогноз на конец</span>
              <strong className={`sales-finance-forecast__plan-kpi-value sales-finance-forecast__reach--${plan.reach.tone}`}>
                {plan.forecastProgressPercent}%
              </strong>
              <span className="sales-finance-forecast__plan-kpi-sub">{formatRub(plan.forecastGross)}</span>
            </article>
          </div>
          <p className={`sales-finance-forecast__verdict sales-finance-forecast__reach--${plan.reach.tone}`}>
            {formatReachLabel(plan.reach, plan.level3)}
          </p>
        </div>
      ) : null}

      {plan?.directions?.length ? (
        <div className="sales-finance-forecast__section">
          <h4 className="sales-finance-forecast__section-title">Прогноз по направлениям</h4>
          <div className="sales-finance-forecast__table-wrap">
            <table className="sales-finance-forecast__table sales-finance-forecast__table--plan">
              <thead>
                <tr>
                  <th scope="col">Направление</th>
                  <th scope="col" className="sales-finance-forecast__col-num">
                    План
                  </th>
                  <th scope="col" className="sales-finance-forecast__col-num">
                    Факт
                  </th>
                  <th scope="col" className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">
                    Прогноз
                  </th>
                  <th scope="col" className="sales-finance-forecast__col-num">
                    % плана
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.directions.map((dir) => {
                  const isMoney = dir.mode === 'revenue'
                  const factText = isMoney ? formatRub(dir.fact) : `${formatValue('count', dir.fact, false)} трен.`
                  const forecastText = isMoney
                    ? formatRub(dir.forecast)
                    : `${formatValue('count', dir.forecast, false)} трен.`
                  const planText = dir.planTarget > 0 ? formatRub(dir.planTarget) : '—'
                  const progressText =
                    dir.mode === 'revenue' && dir.planTarget > 0
                      ? `${dir.forecastProgressPercent}%`
                      : dir.reach.trainingsFallback
                        ? 'по тренировкам'
                        : '—'
                  return (
                    <tr key={dir.key}>
                      <th scope="row">{dir.label}</th>
                      <td className="sales-finance-forecast__col-num">{planText}</td>
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-fact">{factText}</td>
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">{forecastText}</td>
                      <td className="sales-finance-forecast__col-num">
                        <span className={`sales-finance-forecast__badge sales-finance-forecast__badge--${dir.reach.tone}`}>
                          {progressText}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="sales-finance-forecast__section">
        <h4 className="sales-finance-forecast__section-title">Финансы и нагрузка</h4>
        <div className="sales-finance-forecast__table-wrap">
          <table className="sales-finance-forecast__table">
            <thead>
              <tr>
                <th scope="col">Показатель</th>
                <th scope="col" className="sales-finance-forecast__col-num">
                  Факт
                </th>
                <th scope="col" className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">
                  Прогноз
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const factVal = forecast.fact[row.key]
                const forecastVal = forecast.forecast[row.key]
                const rowClass = row.primary ? 'sales-finance-forecast__row--primary' : undefined
                return (
                  <tr key={row.key} className={rowClass}>
                    <th scope="row">{row.label}</th>
                    <td className="sales-finance-forecast__col-num sales-finance-forecast__col-fact">
                      {formatValue(row.kind, factVal, row.negative)}
                    </td>
                    <td
                      className={`sales-finance-forecast__col-num sales-finance-forecast__col-forecast${row.static ? ' sales-finance-forecast__col-static' : ''}`}
                    >
                      {formatValue(row.kind, forecastVal, row.negative)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
