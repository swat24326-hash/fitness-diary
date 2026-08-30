import { useMemo, useState } from 'react'
import { BarChart3, Check, Minus } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { buildPlanMatrixCellDailySeries } from '../lib/admin/salesPlanMatrixCompare.js'
import { SalesPlanMatrixSegmentSchedulePanel } from './SalesPlanMatrixSegmentSchedulePanel.jsx'

/**
 * @param {number} pct
 * @param {'count'|'amount'|'avg'|'forecast'} kind
 */
function compareToneClass(pct, kind, gapRub) {
  if (kind === 'avg') {
    if (gapRub == null) return ''
    return Number(gapRub) < 0 ? ' sales-report__compare-cell--warn' : ' sales-report__compare-cell--ok'
  }
  const n = Number(pct) || 0
  if (kind === 'forecast') {
    if (n >= 99.5) return ' sales-report__compare-cell--ok'
    if (n >= 85) return ' sales-report__compare-cell--mid'
    return ' sales-report__compare-cell--warn'
  }
  if (n >= 95) return ' sales-report__compare-cell--ok'
  if (n >= 70) return ' sales-report__compare-cell--mid'
  return ' sales-report__compare-cell--warn'
}

/**
 * @param {{
 *   comparison: {
 *     rows?: Array<Record<string, unknown>>,
 *     summary_ru?: string,
 *     status_summary?: { ok?: number, lag?: number, risk?: number, total?: number },
 *     calendar_elapsed_pct?: number,
 *   },
 *   monthRows?: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   onOpenDay?: (iso: string) => void,
 * }} props
 */
export function SalesPlanMatrixCompareTable({ comparison, monthRows = [], year, month, onOpenDay }) {
  const rows = comparison?.rows ?? []
  const statusSummary = comparison?.status_summary ?? { ok: 0, lag: 0, total: rows.length }
  const elapsedPct = Number(comparison?.calendar_elapsed_pct) || 0
  const [scheduleCellKey, setScheduleCellKey] = useState(/** @type {string | null} */ (null))

  const scheduleRow = useMemo(
    () => rows.find((r) => r.cellKey === scheduleCellKey) ?? null,
    [rows, scheduleCellKey],
  )

  const scheduleSeries = useMemo(() => {
    if (!scheduleCellKey) return []
    return buildPlanMatrixCellDailySeries(monthRows, year, month, scheduleCellKey)
  }, [scheduleCellKey, monthRows, year, month])

  if (!rows.length) return null

  const openSchedule = (cellKey) => {
    setScheduleCellKey((prev) => (prev === cellKey ? null : cellKey))
  }

  return (
    <div className="sales-report__plan-compare">
      {scheduleRow ? (
        <SalesPlanMatrixSegmentSchedulePanel
          label={String(scheduleRow.label ?? scheduleCellKey)}
          hall={String(scheduleRow.hall ?? '')}
          col={String(scheduleRow.col ?? '')}
          series={scheduleSeries}
          plan={{
            count: Number(scheduleRow.plan?.count) || 0,
            amount: Number(scheduleRow.plan?.amount) || 0,
            avg_check: Number(scheduleRow.plan?.avg_check) || 0,
          }}
          daysInMonth={scheduleSeries.length}
          onClose={() => setScheduleCellKey(null)}
          onOpenDay={onOpenDay}
        />
      ) : null}

      <div className="sales-report__plan-compare-head">
        {comparison.summary_ru ? (
          <p className="sales-report__plan-compare-summary" role="status">
            {comparison.summary_ru}
          </p>
        ) : null}
        <div className="sales-report__plan-compare-chips" aria-label="Сводка по статусам">
          <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--ok">
            <Check size={14} aria-hidden />
            {statusSummary.ok} в темпе
          </span>
          {Number(statusSummary.risk) > 0 ? (
            <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--risk">
              {statusSummary.risk} с риском
            </span>
          ) : null}
          <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--lag">
            <Minus size={14} aria-hidden />
            {statusSummary.lag} отстают
          </span>
          {elapsedPct > 0 ? (
            <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--muted">
              Календарь:{' '}
              {Number.isInteger(elapsedPct)
                ? Math.round(elapsedPct)
                : String(Math.round(elapsedPct * 10) / 10).replace('.', ',')}
              %
            </span>
          ) : null}
        </div>
          {elapsedPct > 0 && elapsedPct < 100 ? (
          <p className="sales-report__plan-compare-forecast-hint">
            {comparison.forecast_method === 'unified_club_pace' ? (
              <>
                Прогноз ₽ и шт — разложение <strong>того же</strong> клубного прогноза (темп отчётов). % в
                строке — к плану <em>сегмента</em>, не к финалу клуба.
                {comparison.club_forecast_gross != null ? (
                  <>
                    {' '}
                    Сегменты {formatRub(comparison.totals?.forecastAmount ?? 0)}
                    {Number(comparison.dop_forecast_gross) > 0
                      ? ` + доп. ${formatRub(comparison.dop_forecast_gross)}`
                      : ''}{' '}
                    = {formatRub(comparison.club_forecast_gross)} (карточка «Прогноз»).
                  </>
                ) : null}
              </>
            ) : (
              <>
                Статус — по сумме и прогнозу к концу месяца. Прогноз ₽: темп будни/выходные + тяга к плану
                сегмента (ДК сильнее).
                {elapsedPct > 0
                  ? ` · календарь: ${
                      Number.isInteger(elapsedPct)
                        ? Math.round(elapsedPct)
                        : String(Math.round(elapsedPct * 10) / 10).replace('.', ',')
                    }%`
                  : ''}
              </>
            )}
            .
          </p>
        ) : null}
      </div>
      <div className="sales-report__matrix-scroll sales-report__matrix-scroll--stats sales-report__matrix-scroll--compare">
        <table className="sales-report__matrix sales-report__stats-matrix sales-report__matrix--compare">
          <thead>
            <tr>
              <th rowSpan={2} className="sales-report__matrix-row-label sales-report__stats-matrix-corner" scope="col">
                Сегмент
              </th>
              <th rowSpan={2} className="sales-report__matrix-subhead sales-report__compare-status-head" scope="col">
                Статус
              </th>
              <th colSpan={4} className="sales-report__matrix-group-head sales-report__compare-group-head" scope="col">
                Количество
              </th>
              <th colSpan={3} className="sales-report__matrix-group-head sales-report__compare-group-head" scope="col">
                Средний чек
              </th>
              <th colSpan={2} className="sales-report__matrix-group-head sales-report__compare-group-head" scope="col">
                Сумма
              </th>
              <th
                colSpan={3}
                className="sales-report__matrix-group-head sales-report__compare-group-head sales-report__compare-group-head--forecast"
                scope="col"
              >
                Прогноз на конец месяца
              </th>
              <th rowSpan={2} className="sales-report__matrix-subhead sales-report__compare-schedule-head" scope="col">
                График
              </th>
            </tr>
            <tr>
              <th className="sales-report__matrix-subhead" scope="col">план</th>
              <th className="sales-report__matrix-subhead" scope="col">факт</th>
              <th className="sales-report__matrix-subhead" scope="col">Δ</th>
              <th className="sales-report__matrix-subhead" scope="col">%</th>
              <th className="sales-report__matrix-subhead" scope="col">план</th>
              <th className="sales-report__matrix-subhead" scope="col">факт</th>
              <th className="sales-report__matrix-subhead" scope="col">Δ</th>
              <th className="sales-report__matrix-subhead" scope="col">план</th>
              <th className="sales-report__matrix-subhead" scope="col">факт</th>
              <th className="sales-report__matrix-subhead sales-report__compare-subhead--forecast" scope="col">
                шт
              </th>
              <th className="sales-report__matrix-subhead sales-report__compare-subhead--forecast" scope="col">
                ₽
              </th>
              <th className="sales-report__matrix-subhead sales-report__compare-subhead--forecast" scope="col">
                % плана
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const countTone = compareToneClass(row.count_progress_pct, 'count')
              const amountTone = compareToneClass(row.amount_progress_pct, 'amount')
              const avgTone = compareToneClass(0, 'avg', row.avg_gap_rub)
              const forecast = row.forecast ?? {}
              const forecastCountTone = compareToneClass(forecast.count_progress_pct, 'forecast')
              const forecastAmountTone = compareToneClass(forecast.amount_progress_pct, 'forecast')
              const showForecast = elapsedPct > 0
              const st = row.status ?? {}
              const statusClass =
                st.status === 'ok'
                  ? ' sales-report__compare-status--ok'
                  : st.status === 'lag'
                    ? ' sales-report__compare-status--lag'
                    : ' sales-report__compare-status--muted'
              const scheduleOpen = scheduleCellKey === row.cellKey
              return (
                <tr
                  key={row.cellKey}
                  className={[
                    'sales-report__stats-matrix-row',
                    'sales-report__compare-row',
                    `sales-report__compare-row--${row.hall}`,
                    scheduleOpen ? 'sales-report__compare-row--schedule-open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-col={row.col}
                >
                  <th
                    className={`sales-report__matrix-row-label sales-report__stats-matrix-row-label sales-report__compare-segment sales-report__compare-segment--${row.col}`}
                    scope="row"
                  >
                    <span className="sales-report__compare-segment-hall">{String(row.label).split(' ')[0]}</span>
                    <span className="sales-report__compare-segment-col">{String(row.label).split(' ')[1]}</span>
                  </th>
                  <td className={`sales-report__compare-status${statusClass}`} title={st.title ?? ''}>
                    <div className="sales-report__compare-status-stack">
                      <div className="sales-report__compare-status-main">
                        <span className="sales-report__compare-status-icon" aria-hidden>
                          {st.status === 'ok' ? (
                            <Check size={16} strokeWidth={2.5} />
                          ) : st.status === 'lag' ? (
                            <Minus size={16} strokeWidth={2.5} />
                          ) : (
                            '—'
                          )}
                        </span>
                        <span className="sales-report__compare-status-label">{st.label ?? '—'}</span>
                      </div>
                      {Array.isArray(st.problems) && st.problems.length > 0 ? (
                        <ul
                          className={`sales-report__compare-problems${st.status === 'ok' ? ' sales-report__compare-problems--risk' : ''}`}
                          aria-label={st.title ?? 'Где отстаём'}
                        >
                          {st.problems.map((problem) => (
                            <li
                              key={problem.key}
                              className={`sales-report__compare-problem sales-report__compare-problem--${problem.key}`}
                              title={problem.detail ?? ''}
                            >
                              <span className="sales-report__compare-problem-label">{problem.label}</span>
                              <span className="sales-report__compare-problem-delta">{problem.delta_text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </td>
                  <td className="sales-report__matrix-computed sales-report__compare-num">{row.plan.count}</td>
                  <td className="sales-report__matrix-computed sales-report__compare-num sales-report__compare-num--fact">
                    {row.fact.count}
                  </td>
                  <td className={`sales-report__matrix-computed sales-report__compare-num${countTone}`}>
                    {row.count_gap > 0 ? `+${row.count_gap}` : row.count_gap}
                  </td>
                  <td className={`sales-report__matrix-computed sales-report__compare-num${countTone}`}>
                    {Math.round(Number(row.count_progress_pct) || 0)}%
                  </td>
                  <td className="sales-report__matrix-computed sales-report__compare-money">{formatRub(row.plan.avg_check)}</td>
                  <td className="sales-report__matrix-computed sales-report__compare-money">
                    {row.fact.avg_check != null ? formatRub(row.fact.avg_check) : '—'}
                  </td>
                  <td className={`sales-report__matrix-computed sales-report__compare-money${avgTone}`}>
                    {row.avg_gap_rub != null
                      ? `${row.avg_gap_rub > 0 ? '+' : ''}${formatRub(row.avg_gap_rub)}`
                      : '—'}
                  </td>
                  <td className="sales-report__matrix-computed sales-report__compare-money">{formatRub(row.plan.amount)}</td>
                  <td className={`sales-report__matrix-computed sales-report__compare-money${amountTone}`}>
                    {formatRub(row.fact.amount)}
                  </td>
                  <td
                    className={`sales-report__matrix-computed sales-report__compare-num sales-report__compare-forecast${showForecast ? forecastCountTone : ''}`}
                  >
                    {showForecast ? forecast.count ?? '—' : '—'}
                  </td>
                  <td
                    className={`sales-report__matrix-computed sales-report__compare-money sales-report__compare-forecast${showForecast ? forecastAmountTone : ''}`}
                  >
                    {showForecast && forecast.amount != null ? formatRub(forecast.amount) : '—'}
                  </td>
                  <td
                    className={`sales-report__matrix-computed sales-report__compare-num sales-report__compare-forecast${showForecast ? forecastAmountTone : ''}`}
                  >
                    {showForecast && row.plan.amount > 0
                      ? `${Math.round(Number(forecast.amount_progress_pct) || 0)}%`
                      : '—'}
                  </td>
                  <td className="sales-report__compare-schedule-cell">
                    <button
                      type="button"
                      className={`sales-report__compare-schedule-btn${scheduleOpen ? ' sales-report__compare-schedule-btn--active' : ''}`}
                      onClick={() => openSchedule(String(row.cellKey))}
                      aria-pressed={scheduleOpen}
                      aria-label={`${scheduleOpen ? 'Скрыть' : 'Построить'} график продаж ${row.label}`}
                    >
                      <BarChart3 size={15} aria-hidden />
                      {scheduleOpen ? 'Скрыть' : 'График'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {comparison.totals ? (
            <tfoot>
              <tr className="sales-report__compare-row sales-report__compare-row--total">
                <th scope="row">Итого сегменты</th>
                <td />
                <td className="sales-report__compare-num">{comparison.totals.planCount}</td>
                <td className="sales-report__compare-num">{comparison.totals.factCount}</td>
                <td colSpan={2} />
                <td colSpan={3} />
                <td className="sales-report__compare-money">{formatRub(comparison.totals.planAmount)}</td>
                <td className="sales-report__compare-money">{formatRub(comparison.totals.factAmount)}</td>
                <td className="sales-report__compare-num sales-report__compare-forecast">
                  {comparison.totals.forecastCount}
                </td>
                <td className="sales-report__compare-money sales-report__compare-forecast">
                  {formatRub(comparison.totals.forecastAmount)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}
