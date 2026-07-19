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
 *   variant?: 'full' | 'plan',
 * }} props
 */
export function SalesFinanceForecast({
  year,
  month,
  monthRows,
  membershipTypes,
  planForm = {},
  expense = 0,
  variant = 'full',
}) {
  const showFinanceLoad = variant === 'full'
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

  const incomeRows = [
    { key: 'earnings', label: 'Заработок месяца', kind: 'money' },
    { key: 'pzTrainings', label: 'Тренировки ПЗ', kind: 'count' },
    { key: 'azTrainings', label: 'Тренировки АЗ', kind: 'count' },
  ]

  const deductionRows = [
    { key: 'refunds', label: 'Возвраты', kind: 'money', static: true },
    { key: 'trainerPayroll', label: 'ЗП персонального зала', kind: 'money' },
    { key: 'aerobicPayroll', label: 'ЗП аэробного зала', kind: 'money' },
    { key: 'expense', label: 'Расход управляющего', kind: 'money', static: true },
  ]

  const netProfitRow = { key: 'netProfit', label: 'Чистая прибыль', kind: 'money', primary: true, signed: true }

  const formatValue = (kind, value, { signed = false } = {}) => {
    if (kind === 'count') return new Intl.NumberFormat('ru-RU').format(value ?? 0)
    const n = Number(value) || 0
    return formatRub(signed ? n : Math.abs(n))
  }

  const financeColGroup = (
    <colgroup>
      <col className="sales-finance-forecast__col-label" />
      <col className="sales-finance-forecast__col-fact-width" />
      <col className="sales-finance-forecast__col-forecast-width" />
    </colgroup>
  )

  const financeTableHead = (
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
  )

  const renderForecastTable = (tableRows, tone) => (
    <table className="sales-finance-forecast__table sales-finance-forecast__table--finance">
      {financeColGroup}
      <tbody>
        {tableRows.map((row) => renderFinanceRow(row, tone))}
      </tbody>
    </table>
  )

  const financeBlocks = [
    { id: 'income', title: 'Доходы и нагрузка', rows: incomeRows, tone: 'income' },
    { id: 'deduction', title: 'Вычитается', rows: deductionRows, tone: 'deduction' },
    { id: 'total', title: null, rows: [netProfitRow], tone: 'primary' },
  ]

  const renderFinanceRow = (row, tone) => {
    const factVal = forecast.fact[row.key]
    const forecastVal = forecast.forecast[row.key]
    const signed = Boolean(row.signed)
    const rowClass = [
      tone === 'primary' ? 'sales-finance-forecast__row--primary' : undefined,
      tone === 'income' ? 'sales-finance-forecast__row--income' : undefined,
      tone === 'deduction' ? 'sales-finance-forecast__row--deduction' : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined
    const factClass = [
      'sales-finance-forecast__col-num',
      'sales-finance-forecast__col-fact',
      signed && Number(factVal) < 0 ? 'sales-finance-forecast__col-negative' : undefined,
    ]
      .filter(Boolean)
      .join(' ')
    const forecastClass = [
      'sales-finance-forecast__col-num',
      'sales-finance-forecast__col-forecast',
      row.static ? 'sales-finance-forecast__col-static' : undefined,
      signed && Number(forecastVal) < 0 ? 'sales-finance-forecast__col-negative' : undefined,
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <tr key={row.key} className={rowClass}>
        <th scope="row">{row.label}</th>
        <td className={factClass}>{formatValue(row.kind, factVal, { signed })}</td>
        <td className={forecastClass}>{formatValue(row.kind, forecastVal, { signed })}</td>
      </tr>
    )
  }

  const formatReachLabel = (reach, planTarget) => {
    if (planTarget <= 0) return 'План не задан'
    if (reach.willReach) return `Прогноз: выполним план (${reach.forecastProgressPercent}%)`
    if (reach.gapRub > 0) {
      return `Прогноз: не дотянем (${reach.forecastProgressPercent}%, не хватает ${formatRub(reach.gapRub)})`
    }
    return `Прогноз: ${reach.forecastProgressPercent}%`
  }

  const formatPaceLabel = (pace) => {
    if (!pace) return null
    if (pace.mode === 'already_at_plan') return 'Факт уже закрывает план.'
    if (pace.mode === 'no_days_left') {
      return `До плана не хватает ${formatRub(pace.gapRub)} — дней отчёта уже не осталось.`
    }
    if (pace.mode === 'weekday' && pace.perDayRub != null) {
      return `Чтобы дотянуть план: ~${formatRub(pace.perDayRub)} в будний день (${pace.remainingWeekdays} буд. осталось).`
    }
    if (pace.perDayRub != null) {
      return `Чтобы дотянуть план: ~${formatRub(pace.perDayRub)} в день (${pace.remainingDays} дн. осталось).`
    }
    return null
  }

  const plan = forecast.plan
  const paceLabel = formatPaceLabel(plan?.pace)

  return (
    <section className="sales-finance-forecast" aria-labelledby="sales-finance-forecast-title">
      <header className="sales-finance-forecast__head">
        <h3 className="sales-finance-forecast__title" id="sales-finance-forecast-title">
          <TrendingUp size={20} aria-hidden className="sales-finance-forecast__title-icon" />
          Прогноз на {monthEndLabel}
        </h3>
        <p className="sales-finance-forecast__hint">
          {forecast.method === 'weekday_weekend_remaining' ? (
            <>
              Факт + среднее будней / выходных × оставшиеся дни (
              <strong>{forecast.dayType?.remainingWeekdays ?? 0}</strong> буд. ·{' '}
              <strong>{forecast.dayType?.remainingWeekends ?? 0}</strong> вых.)
            </>
          ) : (
            <>
              Среднее за <strong>{forecast.reportDays}</strong> отчёт
              {forecast.reportDays === 1 ? '' : forecast.reportDays < 5 ? 'а' : 'ов'} ×{' '}
              <strong>{forecast.daysInMonth}</strong> дн. месяца
            </>
          )}
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
          {paceLabel ? (
            <p className="sales-finance-forecast__pace" role="status">
              {paceLabel}
            </p>
          ) : null}
          {plan.directionLag?.has_lag ? (
            <div className="sales-finance-forecast__direction-lag" role="status">
              <p className="sales-finance-forecast__direction-lag-title">Отставание по залам</p>
              <ul className="sales-finance-forecast__direction-lag-list">
                {plan.directionLag.lagging.map((hall) => (
                  <li key={hall.key} className="sales-finance-forecast__direction-lag-item">
                    <span className="sales-finance-forecast__direction-lag-hall">{hall.label}</span>
                    <span className="sales-finance-forecast__direction-lag-gap">
                      −{formatRub(hall.gapRub)}
                    </span>
                    <span className="sales-finance-forecast__direction-lag-pct">
                      прогноз {hall.forecastProgressPercent}%
                    </span>
                  </li>
                ))}
              </ul>
              {plan.directionLag.summary_ru ? (
                <p className="sales-finance-forecast__direction-lag-summary">{plan.directionLag.summary_ru}</p>
              ) : null}
            </div>
          ) : null}
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
                  <th scope="col" className="sales-finance-forecast__col-num">
                    Не хватает
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.directions.map((dir) => {
                  const isMoney = dir.mode === 'revenue'
                  const factText = isMoney ? formatRub(dir.fact) : `${formatValue('count', dir.fact)} трен.`
                  const forecastText = isMoney
                    ? formatRub(dir.forecast)
                    : `${formatValue('count', dir.forecast)} трен.`
                  const planText = dir.planTarget > 0 ? formatRub(dir.planTarget) : '—'
                  const progressText =
                    dir.mode === 'revenue' && dir.planTarget > 0
                      ? `${dir.forecastProgressPercent}%`
                      : dir.reach.trainingsFallback
                        ? 'по тренировкам'
                        : '—'
                  const gapText =
                    isMoney && dir.planTarget > 0 && dir.reach?.willReach !== true && dir.reach?.gapRub > 0
                      ? `−${formatRub(dir.reach.gapRub)}`
                      : '—'
                  const rowClass =
                    isMoney && dir.planTarget > 0 && dir.reach?.willReach !== true
                      ? 'sales-finance-forecast__row--lag'
                      : undefined
                  return (
                    <tr key={dir.key} className={rowClass}>
                      <th scope="row">{dir.label}</th>
                      <td className="sales-finance-forecast__col-num">{planText}</td>
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-fact">{factText}</td>
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">{forecastText}</td>
                      <td className="sales-finance-forecast__col-num">
                        <span className={`sales-finance-forecast__badge sales-finance-forecast__badge--${dir.reach.tone}`}>
                          {progressText}
                        </span>
                      </td>
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-gap">{gapText}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showFinanceLoad ? (
      <div className="sales-finance-forecast__section">
        <h4 className="sales-finance-forecast__section-title">Финансы и нагрузка</h4>

        <div className="sales-finance-forecast__finance-stack">
          <div className="sales-finance-forecast__table-wrap sales-finance-forecast__table-wrap--head">
            <table className="sales-finance-forecast__table sales-finance-forecast__table--finance sales-finance-forecast__table--head-only">
              {financeColGroup}
              {financeTableHead}
            </table>
          </div>

          {financeBlocks.map((block) => (
            <div
              key={block.id}
              className={`sales-finance-forecast__finance-block sales-finance-forecast__finance-block--${block.tone}`}
            >
              {block.title ? (
                <h5 className={`sales-finance-forecast__subsection-title sales-finance-forecast__subsection-title--${block.tone}`}>
                  {block.title}
                </h5>
              ) : null}
              <div className={`sales-finance-forecast__table-wrap sales-finance-forecast__table-wrap--${block.tone}`}>
                {renderForecastTable(block.rows, block.tone)}
              </div>
            </div>
          ))}
        </div>
      </div>
      ) : null}
    </section>
  )
}
