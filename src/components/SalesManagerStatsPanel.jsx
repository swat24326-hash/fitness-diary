import { useMemo } from 'react'
import { BarChart3, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { buildSalesManagerMonthStats } from '../lib/admin/salesManagerStatsAgg.js'
import { formatRub, SALES_MATRIX_COLS, SALES_MATRIX_HALL_ROWS } from '../lib/admin/salesReportCore.js'
import { SALES_TRAINING_CLUB_ID } from '../lib/admin/salesTrainingsMatrix.js'
import { MembershipTypeStatsTable } from './MembershipTypeStatsTable.jsx'
import { SalesDayBarChart } from './SalesDayBarChart.jsx'
import { SalesProfitDayChart } from './SalesProfitDayChart.jsx'

/**
 * @param {{
 *   monthLabel: string,
 *   year: number,
 *   month: number,
 *   monthRows: Array<Record<string, unknown>>,
 *   planLevels: { level1?: number, level2?: number, level3?: number },
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
        membershipTypes,
        year,
        month,
      }),
    [monthRows, planLevels, membershipTypes, year, month],
  )

  const {
    summary,
    plan,
    structure,
    matrix3x3,
    dailySeries,
    dailyPnkSeries,
    maxDayPnk,
    dailyTrainingsSeries,
    maxDayTrainings,
    trainingsStats,
    trainingsTypedTotal,
    dayTable,
    dopRubTotal,
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
        <p className="muted sales-report__stats-block-note">
          Сумма из ежедневных отчётов менеджера. Итого по типам: <strong>{trainingsTypedTotal}</strong>
          {summary.trainingsTotal !== trainingsTypedTotal ? (
            <span> · в отчётах указано {summary.trainingsTotal}</span>
          ) : null}
        </p>
        <MembershipTypeStatsTable
          byType={trainingsStats.byType}
          byTrainerByType={trainingsStats.byTrainerByType}
          trainerLabel={trainerLabel}
          note="Сумма тренировок из сохранённых отчётов продаж. «Без типа» в итог по типам не входит."
        />
      </div>

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">Структура НК / ДК / УК</h3>
        <div className="sales-report__structure-list">
          {structure.map((item) => (
            <div className="sales-report__structure-row" key={item.key}>
              <div className="sales-report__structure-head">
                <span className="sales-report__structure-label">{item.label}</span>
                <span className="sales-report__structure-sum">{formatRub(item.amount)}</span>
                <span className="sales-report__structure-pct muted">{item.sharePercent}%</span>
              </div>
              <div className="sales-report__structure-track" aria-hidden>
                <div
                  className={`sales-report__structure-fill sales-report__structure-fill--${item.key}`}
                  style={{ width: `${Math.min(100, item.sharePercent)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sales-report__card sales-report__stats-block">
        <h3 className="sales-report__stats-block-title">Матрица продаж за месяц (шт.)</h3>
        <div className="sales-report__matrix-scroll">
          <table className="sales-report__matrix sales-report__stats-matrix">
            <thead>
              <tr>
                <th scope="col" />
                {SALES_MATRIX_COLS.map((col) => (
                  <th key={col.suffix} scope="col">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SALES_MATRIX_HALL_ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {SALES_MATRIX_COLS.map((col) => {
                    const key = `${row.key}_${col.suffix}`
                    return (
                      <td key={key} className="sales-report__matrix-computed">
                        {matrix3x3[key] ?? 0}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="sales-report__matrix-dop-row">
                <th scope="row">Доп. продажи (₽)</th>
                <td colSpan={SALES_MATRIX_COLS.length} className="sales-report__matrix-computed">
                  <strong>{formatRub(dopRubTotal)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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
