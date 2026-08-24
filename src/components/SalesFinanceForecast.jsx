import { useMemo } from 'react'
import { Target, TrendingUp } from 'lucide-react'
import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  buildClubFinanceForecast,
  daysInCalendarMonth,
} from '../lib/admin/clubFinanceForecastCore.js'
import { formatRub } from '../lib/admin/salesReportCore.js'
import {
  NET_PROFIT_MARGIN_HINT_RU,
  NET_PROFIT_MARGIN_LABEL_RU,
  describeNetProfitMarginTone,
  formatNetProfitMarginPercent,
} from '../lib/admin/clubNetProfitMarginCore.js'

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   monthRows: Array<Record<string, unknown>>,
 *   membershipTypes: Array<Record<string, unknown>>,
 *   planForm?: Record<string, string>,
 *   expense?: number,
 *   variant?: 'full' | 'plan',
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
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
  planConfig = null,
  profilesByTrainerId = null,
  clubId = '',
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
        planConfig,
        profilesByTrainerId,
        clubId,
      }),
    [monthRows, year, month, expense, membershipTypes, planForm, planConfig, profilesByTrainerId, clubId],
  )

  if (!forecast.ok) {
    if (forecast.reason === 'not_current_month') {
      return (
        <p className="sales-finance-forecast__note sales-finance-forecast__note--info">
          Этот месяц ещё не начался — факт и прогноз появятся, когда период станет текущим или закроется.
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

  const closedMonth = forecast.closedMonth === true
  const endDay = daysInCalendarMonth(year, month)
  const monthEndLabel = `${String(endDay).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`

  const incomeRows = [
    { key: 'pzTrainings', label: 'Тренировки ПЗ', kind: 'count' },
    { key: 'azTrainings', label: 'Тренировки АЗ', kind: 'count' },
  ]

  const deductionRows = [
    { key: 'refunds', label: 'Возвраты', kind: 'money' },
    { key: 'trainerPayroll', label: 'ЗП персонального зала', kind: 'money' },
    { key: 'aerobicPayroll', label: 'ЗП аэробного зала', kind: 'money' },
    { key: 'expense', label: 'Расход управляющего', kind: 'money', static: true },
  ]

  const trainerPayrollMethod = forecast.payrollPace?.trainer
  const trainerRate = forecast.payrollPace?.trainerRatePerSession
  const trainerPayrollHint =
    !closedMonth && trainerPayrollMethod === 'payroll_from_projected_tiers'
      ? `Прогноз ЗП ПЗ: уровни плана к концу месяца + надбавки кабинета${
          trainerRate != null ? ` · ср. ~${formatRub(trainerRate)}/зан.` : ''
        }.`
      : !closedMonth && trainerRate != null
        ? `Прогноз ЗП ПЗ: темп часов × ср. ${formatRub(trainerRate)}/зан.`
        : null

  const netProfitRow = { key: 'netProfit', label: 'Чистая прибыль', kind: 'money', primary: true, signed: true }
  const netProfitMarginRow = {
    key: 'netProfitMargin',
    label: NET_PROFIT_MARGIN_LABEL_RU,
    kind: 'percent',
    primary: true,
  }

  const formatValue = (kind, value, { signed = false } = {}) => {
    if (kind === 'percent') return formatNetProfitMarginPercent(value)
    if (kind === 'count') return new Intl.NumberFormat('ru-RU').format(value ?? 0)
    const n = Number(value) || 0
    return formatRub(signed ? n : Math.abs(n))
  }

  const financeColGroup = (
    <colgroup>
      <col className="sales-finance-forecast__col-label" />
      <col className="sales-finance-forecast__col-fact-width" />
      {closedMonth ? null : <col className="sales-finance-forecast__col-forecast-width" />}
    </colgroup>
  )

  const financeTableHead = (
    <thead>
      <tr>
        <th scope="col">Показатель</th>
        <th scope="col" className="sales-finance-forecast__col-num">
          Факт
        </th>
        {closedMonth ? null : (
          <th scope="col" className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">
            Прогноз
          </th>
        )}
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
    { id: 'income', title: 'Нагрузка', rows: incomeRows, tone: 'income' },
    { id: 'deduction', title: 'Вычитается', rows: deductionRows, tone: 'deduction' },
    { id: 'total', title: null, rows: [netProfitRow, netProfitMarginRow], tone: 'primary' },
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
      row.kind === 'percent'
        ? `sales-finance-forecast__col-margin--${describeNetProfitMarginTone(factVal).tone}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' ')
    const forecastClass = [
      'sales-finance-forecast__col-num',
      'sales-finance-forecast__col-forecast',
      row.static ? 'sales-finance-forecast__col-static' : undefined,
      signed && Number(forecastVal) < 0 ? 'sales-finance-forecast__col-negative' : undefined,
      row.kind === 'percent'
        ? `sales-finance-forecast__col-margin--${describeNetProfitMarginTone(forecastVal).tone}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <tr key={row.key} className={rowClass}>
        <th scope="row">
          {row.label}
          {row.kind === 'percent' ? (
            <span className="sales-finance-forecast__row-note">{NET_PROFIT_MARGIN_HINT_RU}</span>
          ) : null}
        </th>
        <td className={factClass}>
          {formatValue(row.kind, factVal, { signed })}
          {row.kind === 'percent' && factVal != null ? (
            <span
              className={`sales-finance-forecast__badge sales-finance-forecast__badge--${describeNetProfitMarginTone(factVal).tone}`}
            >
              {describeNetProfitMarginTone(factVal).labelRu}
            </span>
          ) : null}
        </td>
        {closedMonth ? null : (
          <td className={forecastClass}>
            {formatValue(row.kind, forecastVal, { signed })}
            {row.kind === 'percent' && forecastVal != null ? (
              <span
                className={`sales-finance-forecast__badge sales-finance-forecast__badge--${describeNetProfitMarginTone(forecastVal).tone}`}
              >
                {describeNetProfitMarginTone(forecastVal).labelRu}
              </span>
            ) : null}
          </td>
        )}
      </tr>
    )
  }

  /** Действие на конец месяца — лаг «сегодня» уже на карточке «Темп», не повторяем. */
  const formatPaceLabel = (pace, reach) => {
    if (!pace) return null
    if (pace.mode === 'already_at_plan') return 'Факт уже закрывает план.'
    if (pace.mode === 'no_days_left') {
      return `До плана не хватает ${formatRub(pace.gapRub)} — дней отчёта уже не осталось.`
    }
    if (reach?.willReach) return 'По прогнозу план выполним — держите темп.'
    if (pace.mode === 'weekday' && pace.perDayRub != null) {
      return `Нужно ~${formatRub(pace.perDayRub)} в будний день · ${pace.remainingWeekdays} буд. осталось`
    }
    if (pace.perDayRub != null) {
      return `Нужно ~${formatRub(pace.perDayRub)} в день · ${pace.remainingDays} дн. осталось`
    }
    return null
  }

  const plan = forecast.plan
  const calendarNorm = plan?.calendarNorm
  const reach = plan?.reach
  const paceLabel = formatPaceLabel(plan?.pace, reach)
  /** Под прогнозом — ₽ и дыра до плана; «план по прогнозу» не дублируем, если % уже ≥100. */
  const forecastSub =
    reach?.willReach === true
      ? formatRub(plan.forecastGross)
      : reach?.gapRub > 0
        ? `${formatRub(plan.forecastGross)} · −${formatRub(reach.gapRub)} до плана`
        : formatRub(plan?.forecastGross)

  const tempoSub = (() => {
    if (!calendarNorm) return null
    const lag =
      calendarNorm.lagRub !== 0
        ? `${calendarNorm.lagRub > 0 ? '+' : '−'}${formatRub(Math.abs(calendarNorm.lagRub))}`
        : null
    if (lag) return `${lag} к норме ${formatRub(calendarNorm.expectedRub)}`
    return `норма ${formatRub(calendarNorm.expectedRub)}`
  })()

  return (
    <section className="sales-finance-forecast" aria-labelledby="sales-finance-forecast-title">
      <header className="sales-finance-forecast__head">
        <h3 className="sales-finance-forecast__title" id="sales-finance-forecast-title">
          <TrendingUp size={20} aria-hidden className="sales-finance-forecast__title-icon" />
          {closedMonth ? `Итоги месяца (факт) · до ${monthEndLabel}` : `План и прогноз · до ${monthEndLabel}`}
        </h3>
        <p className="sales-finance-forecast__hint">
          {closedMonth
            ? 'Месяц закрыт — цифры по заполненным отчётам. Прогноз строится только в текущем месяце.'
            : `Темп к норме на сегодня · прогноз на конец месяца${
                forecast.method === 'mix_and_profit_blend'
                  ? ' · с учётом матрицы покупок'
                  : forecast.method === 'weekday_weekend_remaining'
                    ? ' · будни и выходные отдельно'
                    : ''
              }`}
        </p>
      </header>

      {plan?.level3 > 0 ? (
        <div className="sales-finance-forecast__section">
          <div className="sales-finance-forecast__plan-cards">
            <article className="sales-finance-forecast__plan-card">
              <span className="sales-finance-forecast__plan-kpi-label">План</span>
              <strong className="sales-finance-forecast__plan-kpi-value">{formatRub(plan.level3)}</strong>
            </article>
            <article className="sales-finance-forecast__plan-card">
              <span className="sales-finance-forecast__plan-kpi-label">Факт</span>
              <strong className="sales-finance-forecast__plan-kpi-value">{formatRub(plan.factGross)}</strong>
              <span className="sales-finance-forecast__plan-kpi-sub">{plan.factProgressPercent}% плана</span>
            </article>
            {!closedMonth && calendarNorm ? (
              <article
                className={`sales-finance-forecast__plan-card sales-finance-forecast__plan-card--${calendarNorm.tone}`}
              >
                <span className="sales-finance-forecast__plan-kpi-label">Темп</span>
                <strong
                  className={`sales-finance-forecast__plan-kpi-value sales-finance-forecast__reach--${calendarNorm.tone}`}
                >
                  {String(calendarNorm.pacePct).replace('.', ',')}%
                </strong>
                {tempoSub ? (
                  <span className="sales-finance-forecast__plan-kpi-sub">{tempoSub}</span>
                ) : null}
              </article>
            ) : null}
            {closedMonth ? (
              <article className={`sales-finance-forecast__plan-card sales-finance-forecast__plan-card--${reach?.tone ?? 'ok'}`}>
                <span className="sales-finance-forecast__plan-kpi-label">Итог к плану</span>
                <strong className={`sales-finance-forecast__plan-kpi-value sales-finance-forecast__reach--${reach?.tone ?? 'ok'}`}>
                  {plan.factProgressPercent}%
                </strong>
                <span className="sales-finance-forecast__plan-kpi-sub">
                  {reach?.willReach
                    ? 'план выполнен'
                    : reach?.gapRub
                      ? `не хватило ${formatRub(reach.gapRub)}`
                      : 'по факту отчётов'}
                </span>
              </article>
            ) : (
              <article className={`sales-finance-forecast__plan-card sales-finance-forecast__plan-card--${reach?.tone ?? 'ok'}`}>
                <span className="sales-finance-forecast__plan-kpi-label">Прогноз</span>
                <strong className={`sales-finance-forecast__plan-kpi-value sales-finance-forecast__reach--${reach?.tone ?? 'ok'}`}>
                  {plan.forecastProgressPercent}%
                </strong>
                <span className="sales-finance-forecast__plan-kpi-sub">{forecastSub}</span>
              </article>
            )}
          </div>

          {!closedMonth && paceLabel ? (
            <p
              className={`sales-finance-forecast__action sales-finance-forecast__action--${reach?.willReach ? 'ok' : 'focus'}`}
              role="status"
            >
              {paceLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      {plan?.directions?.length ? (
        <div className="sales-finance-forecast__section">
          <h4 className="sales-finance-forecast__section-title">
            <Target size={17} aria-hidden className="sales-finance-forecast__section-icon" />
            {closedMonth ? 'По направлениям' : 'Прогноз по направлениям'}
          </h4>
          {plan.totals?.planNoteRu ? (
            <p className="sales-finance-forecast__plan-align-note" role="status">
              {plan.totals.planNoteRu}
            </p>
          ) : null}
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
                  {closedMonth ? null : (
                    <th scope="col" className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">
                      Прогноз
                    </th>
                  )}
                  <th scope="col" className="sales-finance-forecast__col-num">
                    % плана
                  </th>
                  <th scope="col" className="sales-finance-forecast__col-num">
                    До плана напр.
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.directions.map((dir) => {
                  const isMoney = dir.mode === 'revenue'
                  const noRevenue = dir.mode === 'no_revenue'
                  const isUnallocated = dir.unallocatedPlan === true || dir.key === 'unallocated'
                  const factText = isMoney
                    ? formatRub(dir.fact)
                    : noRevenue
                      ? 'нет выручки'
                      : `${formatValue('count', dir.fact)} трен.`
                  const forecastText = isMoney
                    ? formatRub(dir.forecast)
                    : noRevenue
                      ? '—'
                      : `${formatValue('count', dir.forecast)} трен.`
                  const planText = dir.planTarget > 0 ? formatRub(dir.planTarget) : '—'
                  const progressPct = closedMonth ? dir.factProgressPercent : dir.forecastProgressPercent
                  const progressText =
                    isMoney && dir.planTarget > 0
                      ? `${progressPct}%`
                      : noRevenue
                        ? 'нет выручки по залу'
                        : '—'
                  const signedGap = Number(dir.reach?.signedGapRub)
                  const gapText =
                    isMoney && dir.planTarget > 0 && Number.isFinite(signedGap) && Math.abs(signedGap) >= 0.5
                      ? `${signedGap > 0 ? '+' : '−'}${formatRub(Math.abs(signedGap))}`
                      : '—'
                  const trainingsHint = (() => {
                    if (!noRevenue) return null
                    if (closedMonth) {
                      return dir.trainingsFact > 0 || dir.fact > 0
                        ? `трен. ${formatValue('count', dir.trainingsFact ?? dir.fact)} (не к плану ₽)`
                        : null
                    }
                    if (dir.trainingsFact > 0 || dir.trainingsForecast > 0) {
                      return `трен. ${formatValue('count', dir.trainingsFact)} → ${formatValue('count', dir.trainingsForecast)} (не к плану ₽)`
                    }
                    return null
                  })()
                  const rowClass = [
                    isUnallocated
                      ? 'sales-finance-forecast__row--unallocated'
                      : isMoney && dir.planTarget > 0 && dir.reach?.willReach !== true
                        ? 'sales-finance-forecast__row--lag'
                        : undefined,
                    noRevenue ? 'sales-finance-forecast__row--no-revenue' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                  return (
                    <tr key={dir.key} className={rowClass}>
                      <th scope="row">
                        {dir.label}
                        {trainingsHint ? (
                          <span className="sales-finance-forecast__dir-note">{trainingsHint}</span>
                        ) : null}
                      </th>
                      <td className="sales-finance-forecast__col-num">{planText}</td>
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-fact">{factText}</td>
                      {closedMonth ? null : (
                        <td className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">
                          {forecastText}
                        </td>
                      )}
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
              {plan.totals ? (
                <tfoot>
                  <tr className="sales-finance-forecast__row--total">
                    <th scope="row">Итого</th>
                    <td className="sales-finance-forecast__col-num">
                      {plan.totals.planSum > 0 ? formatRub(plan.totals.planSum) : '—'}
                    </td>
                    <td className="sales-finance-forecast__col-num sales-finance-forecast__col-fact">
                      {formatRub(plan.totals.factSum)}
                    </td>
                    {closedMonth ? null : (
                      <td className="sales-finance-forecast__col-num sales-finance-forecast__col-forecast">
                        {formatRub(plan.totals.forecastSum)}
                      </td>
                    )}
                    <td className="sales-finance-forecast__col-num">
                      {plan.totals.planSum > 0
                        ? `${plan.totals.progressVsPlanSum ?? 0}%`
                        : plan.level3 > 0
                          ? `${closedMonth ? plan.factProgressPercent : plan.forecastProgressPercent}%`
                          : '—'}
                    </td>
                    <td className="sales-finance-forecast__col-num sales-finance-forecast__col-gap">
                      {Number.isFinite(Number(plan.totals.signedDirectionGapRub)) &&
                      Math.abs(Number(plan.totals.signedDirectionGapRub)) >= 0.5
                        ? `${Number(plan.totals.signedDirectionGapRub) > 0 ? '+' : '−'}${formatRub(
                            Math.abs(Number(plan.totals.signedDirectionGapRub)),
                          )}`
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <p className="sales-finance-forecast__table-footnote">
            Итого факт и прогноз = карточки клуба. «До плана напр.» — прогноз минус план той же строки (плюс = запас).
            В «Итого» % и эта колонка — к сумме планов направлений, сумма строк сходится с итогом
            {plan.totals?.directionsAbove && plan.totals?.clubProgressPercent != null
              ? ` · к финалу клуба сейчас ${plan.totals.clubProgressPercent}%`
              : ''}
            .
          </p>
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
          {trainerPayrollHint ? (
            <p className="sales-finance-forecast__table-footnote" role="note">
              {trainerPayrollHint}
            </p>
          ) : null}
        </div>
      </div>
      ) : null}
    </section>
  )
}
