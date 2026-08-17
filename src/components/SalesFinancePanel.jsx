import { useMemo } from 'react'
import { Wallet } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { buildClubFinanceForecast } from '../lib/admin/clubFinanceForecastCore.js'
import {
  NET_PROFIT_MARGIN_LABEL_RU,
  describeNetProfitMarginTone,
  formatNetProfitMarginPercent,
} from '../lib/admin/clubNetProfitMarginCore.js'
import { SalesFinanceForecast } from './SalesFinanceForecast.jsx'

/**
 * @param {{
 *   monthLabel: string,
 *   planForm: Record<string, string>,
 *   monthSummary: {
 *     profitTotal?: number,
 *     expense?: number,
 *     netProfit?: number,
     netProfitMargin?: number | null,
 *     profitNk?: number,
 *     profitDk?: number,
 *     profitUk?: number,
 *     profitGrossTotal?: number,
 *     refundsTotal?: number,
 *     trainingsTotal?: number,
 *     trainerPayroll?: number,
 *     aerobicPayroll?: number,
 *     hallFinance?: {
 *       pz?: { revenue?: number, payroll?: number, netProfit?: number },
 *       tz?: { revenue?: number },
 *       az?: { revenue?: number, payroll?: number, netProfit?: number },
 *     },
 *   } | null,
 *   year: number,
 *   month: number,
 *   monthRows?: Array<Record<string, unknown>>,
 *   membershipTypes?: Array<Record<string, unknown>>,
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 * }} props
 */
export function SalesFinancePanel({
  monthLabel,
  planForm,
  monthSummary,
  year,
  month,
  monthRows = [],
  membershipTypes = [],
  planConfig = null,
  profilesByTrainerId = null,
  clubId = '',
}) {
  const summary = monthSummary ?? {}
  const expense = summary.expense ?? 0

  /** Когда есть блок «факт | прогноз», те же цифры в KPI ниже не повторяем. */
  const forecastShowsFact = useMemo(
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
      }).ok === true,
    [monthRows, year, month, expense, membershipTypes, planForm, planConfig, profilesByTrainerId, clubId],
  )

  return (
    <section className="sales-report__finance" aria-labelledby="sales-finance-title">
      <h2 className="sales-report__section-title" id="sales-finance-title">
        <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        Финансы клуба
      </h2>
      <p className="sales-report__month-label muted">{monthLabel}</p>

      <SalesFinanceForecast
        year={year}
        month={month}
        monthRows={monthRows}
        membershipTypes={membershipTypes}
        planForm={planForm}
        expense={expense}
        planConfig={planConfig}
        profilesByTrainerId={profilesByTrainerId}
        clubId={clubId}
      />

      {!forecastShowsFact ? (
        <>
          <h3 className="sales-finance-actual__title">Итоги месяца (факт)</h3>
          <div className="sales-report__kpi-grid sales-finance-summary">
            {(summary.refundsTotal ?? 0) > 0 ? (
              <div className="sales-report__kpi">
                <span className="sales-report__kpi-label">Возвраты за месяц</span>
                <span className="sales-report__kpi-value sales-report__kpi-value--expense">
                  −{formatRub(summary.refundsTotal ?? 0)}
                </span>
              </div>
            ) : null}
            <div className="sales-report__kpi">
              <span className="sales-report__kpi-label">ЗП персонального зала</span>
              <span className="sales-report__kpi-value">{formatRub(summary.trainerPayroll ?? 0)}</span>
            </div>
            <div className="sales-report__kpi">
              <span className="sales-report__kpi-label">ЗП аэробного зала</span>
              <span className="sales-report__kpi-value">{formatRub(summary.aerobicPayroll ?? 0)}</span>
            </div>
            <div className="sales-report__kpi">
              <span className="sales-report__kpi-label">Расход управляющего</span>
              <span className="sales-report__kpi-value">{formatRub(summary.expense ?? 0)}</span>
            </div>
            <div className="sales-report__kpi sales-report__kpi--primary">
              <span className="sales-report__kpi-label">Чистая прибыль</span>
              <span className="sales-report__kpi-value">{formatRub(summary.netProfit ?? 0)}</span>
            </div>
            {summary.netProfitMargin != null ? (
              <div className="sales-report__kpi sales-report__kpi--primary">
                <span className="sales-report__kpi-label">{NET_PROFIT_MARGIN_LABEL_RU}</span>
                <span
                  className={`sales-report__kpi-value sales-report__kpi-value--margin-${describeNetProfitMarginTone(summary.netProfitMargin).tone}`}
                >
                  {formatNetProfitMarginPercent(summary.netProfitMargin)}
                </span>
                <span className="sales-report__kpi-note muted">
                  {describeNetProfitMarginTone(summary.netProfitMargin).labelRu}
                </span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {summary.hallFinance ? (
        <div className="sales-report__hall-finance">
          <h4 className="sales-report__hall-finance-title">По залам (доп.)</h4>
          <div className="sales-report__kpi-grid sales-report__kpi-grid--compact">
            <div className="sales-report__kpi sales-report__kpi--supplement">
              <span className="sales-report__kpi-label">Чистая прибыль ПЗ</span>
              <span className="sales-report__kpi-value">{formatRub(summary.hallFinance.pz?.netProfit ?? 0)}</span>
              <span className="sales-report__kpi-note muted">
                выручка ПЗ {formatRub(summary.hallFinance.pz?.revenue ?? 0)} − ЗП{' '}
                {formatRub(summary.hallFinance.pz?.payroll ?? 0)}
              </span>
            </div>
            <div className="sales-report__kpi sales-report__kpi--supplement">
              <span className="sales-report__kpi-label">Продажи ТЗ</span>
              <span className="sales-report__kpi-value">{formatRub(summary.hallFinance.tz?.revenue ?? 0)}</span>
              <span className="sales-report__kpi-note muted">выручка направления за месяц</span>
            </div>
            <div className="sales-report__kpi sales-report__kpi--supplement">
              <span className="sales-report__kpi-label">Чистая прибыль АЗ</span>
              <span className="sales-report__kpi-value">{formatRub(summary.hallFinance.az?.netProfit ?? 0)}</span>
              <span className="sales-report__kpi-note muted">
                выручка АЗ {formatRub(summary.hallFinance.az?.revenue ?? 0)} − ЗП{' '}
                {formatRub(summary.hallFinance.az?.payroll ?? 0)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <p className="muted sales-finance-summary-note">
        НК {formatRub(summary.profitNk ?? 0)} · ДК {formatRub(summary.profitDk ?? 0)} · УК{' '}
        {formatRub(summary.profitUk ?? 0)} · тренировок {summary.trainingsTotal ?? 0}
      </p>
    </section>
  )
}
