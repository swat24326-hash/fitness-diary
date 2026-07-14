import { useMemo } from 'react'
import { BarChart3, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { buildSalesManagerMonthStats } from '../lib/admin/salesManagerStatsAgg.js'
import { formatRub, SALES_MATRIX_COLS, SALES_MATRIX_HALL_ROWS } from '../lib/admin/salesReportCore.js'
import { SALES_TRAINING_CLUB_ID } from '../lib/admin/salesTrainingsMatrix.js'
import { MembershipTypeStatsTable } from './MembershipTypeStatsTable.jsx'
import { SalesDayBarChart } from './SalesDayBarChart.jsx'
import { SalesProfitDayChart } from './SalesProfitDayChart.jsx'
import { SalesStructureBlock } from './SalesStructureBlock.jsx'

/**
 * @param {{
 *   monthLabel: string,
 *   year: number,
 *   month: number,
 *   monthRows: Array<Record<string, unknown>>,
 *   planLevels: { level1?: number, level2?: number, level3?: number },
 *   planDirections?: { plan_pz?: number, plan_tz?: number, plan_az?: number, plan_extra?: number },
 *   planMatrix?: unknown,
 *   membershipTypes?: Array<{ id: string, code?: string }>,
 *   trainers?: Array<{ id: string, full_name?: string, name?: string }>,
 *   onPrevMonth: () => void,
 *   onNextMonth: () => void,
 *   onOpenDay: (iso: string) => void,
 *   showPayroll?: boolean,
 * }} props
 */
export function SalesManagerStatsPanel({
  monthLabel,
  year,
  month,
  monthRows,
  planLevels,
  planDirections = {},
  planMatrix = {},
  membershipTypes = [],
  trainers = [],
  onPrevMonth,
  onNextMonth,
  onOpenDay,
  showPayroll = false,
}) {
  const trainerLabel = useMemo(() => {
    const byId = new Map(
      (trainers ?? []).map((t) => [String(t.id ?? ''), String(t.full_name ?? t.name ?? '').trim() || '—']),
    )
    return (id) => {
      if (id === SALES_TRAINING_CLUB_ID) return 'По клубу'
      return byId.get(String(id ?? '')) ?? (id || '—')
    }
  }, [trainers])

  const stats = useMemo(
    () =>
      buildSalesManagerMonthStats({
        monthRows,
        planLevels,
        planDirections,
        planMatrix,
        membershipTypes,
        year,
        month,
      }),
    [monthRows, planLevels, planDirections, planMatrix, membershipTypes, year, month],
  )

  const {
    summary,
    plan,
    structure,
    directionStructure,
    matrix3x3,
    matrix3x3Amounts,
    planMatrixComparison,
    dailySeries,
    dailyPnkSeries,
    maxDayPnk,
    dailyTrainingsSeries,
    maxDayTrainings,
    trainingsStats,
    dayTable,
    hallFinance,
    aerobicStats,
  } = stats

  return (
    <section className="sales-report__stats" aria-labelledby="sales-stats-title">
      <div className="sales-report__stats-head">
        <h2 className="sales-report__section-title" id="sales-stats-title">
          <BarChart3 size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
          Статистика месяца
        </h2>
        <div className="sales-report__stats-month-nav">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onPrevMonth} aria-label="Предыдущий месяц">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="sales-report__stats-month-label">{monthLabel}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNextMonth} aria-label="Следующий месяц">
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="sales-report__kpi-grid sales-report__stats-kpi">
        <div className="sales-report__kpi sales-report__kpi--primary">
          <span className="sales-report__kpi-label">Заработок</span>
          <span className="sales-report__kpi-value">{formatRub(summary.profitTotal)}</span>
        </div>
        {(summary.refundsTotal ?? 0) > 0 ? (
          <div className="sales-report__kpi">
            <span className="sales-report__kpi-label">Возвраты</span>
            <span className="sales-report__kpi-value sales-report__kpi-value--expense">
              −{formatRub(summary.refundsTotal ?? 0)}
            </span>
          </div>
        ) : null}
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">План (ур. 3)</span>
          <span className="sales-report__kpi-value">
            {plan.finalTarget > 0 ? `${Math.round(plan.progressPercent)}%` : '—'}
          </span>
        </div>
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">Дней с отчётом</span>
          <span className="sales-report__kpi-value">
            {summary.dayCount} / {summary.daysInMonth}
          </span>
        </div>
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">ПНК за месяц</span>
          <span className="sales-report__kpi-value">{summary.pnkTotal}</span>
        </div>
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">Тренировок</span>
          <span className="sales-report__kpi-value">{summary.trainingsTotal}</span>
        </div>
        {showPayroll ? (
          <>
            <div className="sales-report__kpi">
              <span className="sales-report__kpi-label">ЗП персонального зала</span>
              <span className="sales-report__kpi-value">{formatRub(summary.trainerPayroll ?? 0)}</span>
            </div>
            <div className="sales-report__kpi">
              <span className="sales-report__kpi-label">ЗП аэробного зала</span>
              <span className="sales-report__kpi-value">{formatRub(summary.aerobicPayroll ?? 0)}</span>
            </div>
            {hallFinance ? (
              <>
                <div className="sales-report__kpi sales-report__kpi--supplement">
                  <span className="sales-report__kpi-label">Чистая прибыль ПЗ</span>
                  <span className="sales-report__kpi-value">{formatRub(hallFinance.pz?.netProfit ?? 0)}</span>
                </div>
                <div className="sales-report__kpi sales-report__kpi--supplement">
                  <span className="sales-report__kpi-label">Продажи ТЗ</span>
                  <span className="sales-report__kpi-value">{formatRub(hallFinance.tz?.revenue ?? 0)}</span>
                </div>
                <div className="sales-report__kpi sales-report__kpi--supplement">
                  <span className="sales-report__kpi-label">Чистая прибыль АЗ</span>
                  <span className="sales-report__kpi-value">{formatRub(hallFinance.az?.netProfit ?? 0)}</span>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">Прибыль по дням</h3>
        <p className="muted sales-report__stats-block-note">
          Нажмите на день с отчётом — откроется вкладка «Отчёт за день».
        </p>
        <SalesProfitDayChart series={dailySeries} onDayClick={onOpenDay} />
      </div>

      <div className="sales-report__stats-duo">
        <div className="sales-report__card sales-report__stats-block">
          <h3 className="sales-report__stats-block-title">ПНК по дням</h3>
          <SalesDayBarChart
            series={dailyPnkSeries}
            maxValue={maxDayPnk}
            onDayClick={onOpenDay}
            formatValue={(n) => String(n)}
            ariaLabel="ПНК по дням месяца"
            barClassName="sales-report__profit-chart-bar--pnk"
          />
        </div>
        <div className="sales-report__card sales-report__stats-block">
          <h3 className="sales-report__stats-block-title">Тренировок по дням</h3>
          <SalesDayBarChart
            series={dailyTrainingsSeries}
            maxValue={maxDayTrainings}
            onDayClick={onOpenDay}
            formatValue={(n) => String(n)}
            ariaLabel="Тренировки по дням месяца"
            barClassName="sales-report__profit-chart-bar--trainings"
          />
        </div>
      </div>

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">Тренировки по типам карт</h3>
        <MembershipTypeStatsTable
          byType={trainingsStats.byType}
          byTrainerByType={trainingsStats.byTrainerByType}
          trainerLabel={trainerLabel}
        />
      </div>

      {aerobicStats?.byType?.length ? (
        <div className="sales-report__card sales-report__stats-block">
          <h3 className="sales-report__stats-block-title">Тренировки в аэробном зале</h3>
          <div className="table-wrap admin-mem-type-table-wrap">
            <table className="admin-mem-type-table">
              <thead>
                <tr>
                  <th className="admin-mem-type-table__trainer-col" scope="col" />
                  {aerobicStats.byType.map((row) => (
                    <th key={row.typeId} className="admin-mem-type-table__type-col" scope="col">
                      {row.code}
                    </th>
                  ))}
                  <th className="admin-mem-type-table__sum-col" scope="col">
                    Итого
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="admin-mem-type-table__club-row">
                  <th className="admin-mem-type-table__trainer-col" scope="row">
                    Кол-во
                  </th>
                  {aerobicStats.byType.map((row) => (
                    <td key={row.typeId} className="admin-mem-type-table__num">
                      {row.count > 0 ? row.count : 0}
                    </td>
                  ))}
                  <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                    <strong>{aerobicStats.total}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">Структура продаж</h3>
        <SalesStructureBlock title="Категории абонементов (НК / ДК / УК / доп.)" items={structure} />
        <SalesStructureBlock
          title="Направления (план)"
          items={directionStructure}
          showPlan
        />
      </div>

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">Матрица продаж за месяц</h3>
        <div className="sales-report__matrix-scroll sales-report__matrix-scroll--stats">
          <table className="sales-report__matrix sales-report__stats-matrix sales-report__matrix--flat">
            <colgroup>
              <col className="sales-report__stats-matrix-col-label" />
              {SALES_MATRIX_COLS.flatMap((col) => [
                <col key={`${col.suffix}-cnt`} className="sales-report__stats-matrix-col-cnt" />,
                <col key={`${col.suffix}-sum`} className="sales-report__stats-matrix-col-sum" />,
              ])}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} className="sales-report__matrix-row-label sales-report__stats-matrix-corner" scope="col" />
                {SALES_MATRIX_COLS.map((col) => (
                  <th
                    key={col.suffix}
                    colSpan={2}
                    className={`sales-report__matrix-group-head sales-report__stats-matrix-group sales-report__stats-matrix-group--${col.suffix}`}
                    scope="col"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
              <tr>
                {SALES_MATRIX_COLS.flatMap((col) => [
                  <th
                    key={`${col.suffix}-cnt`}
                    className={`sales-report__matrix-subhead sales-report__stats-matrix-group sales-report__stats-matrix-group--${col.suffix} sales-report__stats-matrix-subhead--cnt`}
                    scope="col"
                  >
                    шт
                  </th>,
                  <th
                    key={`${col.suffix}-sum`}
                    className={`sales-report__matrix-subhead sales-report__stats-matrix-group sales-report__stats-matrix-group--${col.suffix} sales-report__stats-matrix-subhead--sum`}
                    scope="col"
                  >
                    ₽
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {SALES_MATRIX_HALL_ROWS.map((row) => (
                <tr key={row.key} className="sales-report__stats-matrix-row">
                  <th className="sales-report__matrix-row-label sales-report__stats-matrix-row-label" scope="row">
                    {row.label}
                  </th>
                  {SALES_MATRIX_COLS.flatMap((col) => {
                    const key = `${row.key}_${col.suffix}`
                    const count = matrix3x3[key] ?? 0
                    const amount = matrix3x3Amounts[key] ?? 0
                    return [
                      <td
                        key={`${key}-cnt`}
                        className={`sales-report__matrix-computed sales-report__stats-matrix-cell sales-report__stats-matrix-group sales-report__stats-matrix-group--${col.suffix} sales-report__stats-matrix-cell--cnt`}
                      >
                        {count > 0 ? count : 0}
                      </td>,
                      <td
                        key={`${key}-sum`}
                        className={`sales-report__matrix-computed sales-report__stats-matrix-cell sales-report__stats-matrix-group sales-report__stats-matrix-group--${col.suffix} sales-report__stats-matrix-cell--sum`}
                      >
                        {amount > 0 ? formatRub(amount) : '—'}
                      </td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {planMatrixComparison?.has_plan_matrix ? (
        <div className="sales-report__card sales-report__stats-block">
          <h3 className="sales-report__stats-block-title">План vs факт по сегментам</h3>
          {planMatrixComparison.summary_ru ? (
            <p className="sales-report__plan-sum-hint muted" role="status">
              {planMatrixComparison.summary_ru}
            </p>
          ) : null}
          <div className="sales-report__matrix-scroll sales-report__matrix-scroll--stats">
            <table className="sales-report__matrix sales-report__stats-matrix sales-report__matrix--compare">
              <thead>
                <tr>
                  <th rowSpan={2} className="sales-report__matrix-row-label sales-report__stats-matrix-corner" scope="col" />
                  <th colSpan={4} className="sales-report__matrix-group-head" scope="col">
                    Количество
                  </th>
                  <th colSpan={3} className="sales-report__matrix-group-head" scope="col">
                    Средний чек
                  </th>
                  <th colSpan={2} className="sales-report__matrix-group-head" scope="col">
                    Сумма
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
                </tr>
              </thead>
              <tbody>
                {planMatrixComparison.rows.map((row) => {
                  const countTone =
                    Number(row.count_progress_pct) < 90
                      ? ' sales-report__compare-cell--warn'
                      : ' sales-report__compare-cell--ok'
                  const avgTone =
                    row.avg_gap_rub != null && Number(row.avg_gap_rub) < 0
                      ? ' sales-report__compare-cell--warn'
                      : ' sales-report__compare-cell--ok'
                  return (
                    <tr key={row.cellKey} className="sales-report__stats-matrix-row">
                      <th className="sales-report__matrix-row-label sales-report__stats-matrix-row-label" scope="row">
                        {row.label}
                      </th>
                      <td className="sales-report__matrix-computed">{row.plan.count}</td>
                      <td className="sales-report__matrix-computed">{row.fact.count}</td>
                      <td className={`sales-report__matrix-computed${countTone}`}>
                        {row.count_gap > 0 ? `+${row.count_gap}` : row.count_gap}
                      </td>
                      <td className={`sales-report__matrix-computed${countTone}`}>
                        {Math.round(Number(row.count_progress_pct) || 0)}%
                      </td>
                      <td className="sales-report__matrix-computed">{formatRub(row.plan.avg_check)}</td>
                      <td className="sales-report__matrix-computed">
                        {row.fact.avg_check != null ? formatRub(row.fact.avg_check) : '—'}
                      </td>
                      <td className={`sales-report__matrix-computed${avgTone}`}>
                        {row.avg_gap_rub != null
                          ? `${row.avg_gap_rub > 0 ? '+' : ''}${formatRub(row.avg_gap_rub)}`
                          : '—'}
                      </td>
                      <td className="sales-report__matrix-computed">{formatRub(row.plan.amount)}</td>
                      <td className="sales-report__matrix-computed">{formatRub(row.fact.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">
          <Calendar size={18} style={{ verticalAlign: -3, marginRight: 6 }} aria-hidden />
          Таблица дней
        </h3>
        {dayTable.length ? (
          <div className="sales-report__stats-table-wrap">
            <table className="sales-report__stats-table">
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  <th scope="col">НК</th>
                  <th scope="col">ДК</th>
                  <th scope="col">УК</th>
                  {(summary.refundsTotal ?? 0) > 0 ? <th scope="col">Возвр.</th> : null}
                  <th scope="col">Итого</th>
                  <th scope="col">Трен.</th>
                  <th scope="col">ПНК</th>
                </tr>
              </thead>
              <tbody>
                {dayTable.map((row) => (
                  <tr key={row.date}>
                    <td>
                      <button type="button" className="sales-report__stats-day-link" onClick={() => onOpenDay(row.date)}>
                        {row.date.slice(8, 10)}.{row.date.slice(5, 7)}
                      </button>
                    </td>
                    <td>{formatRub(row.profitNk)}</td>
                    <td>{formatRub(row.profitDk)}</td>
                    <td>{formatRub(row.profitUk)}</td>
                    {(summary.refundsTotal ?? 0) > 0 ? (
                      <td>{row.refunds > 0 ? `−${formatRub(row.refunds)}` : '—'}</td>
                    ) : null}
                    <td>
                      <strong>{formatRub(row.profitDay)}</strong>
                    </td>
                    <td>{row.trainings}</td>
                    <td>{row.pnk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted sales-report__stats-empty" role="status">
            За этот месяц ещё нет сохранённых отчётов.
          </p>
        )}
      </div>
    </section>
  )
}
