import { Save, Wallet } from 'lucide-react'
import { PLAN_LEVEL_KEYS, PLAN_LEVEL_LABELS, formatRub } from '../lib/admin/salesReportCore.js'
import { SalesFinanceBlock } from './SalesFinanceBlock.jsx'
import { SalesPlanDirectionsForm } from './SalesPlanDirectionsForm.jsx'

/**
 * @param {{
 *   monthLabel: string,
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   expenseForm: Record<string, string>,
 *   onExpenseChange: (next: Record<string, string>) => void,
 *   monthSummary: {
 *     profitTotal?: number,
 *     expense?: number,
 *     netProfit?: number,
 *     profitNk?: number,
 *     profitDk?: number,
 *     profitUk?: number,
 *     trainingsTotal?: number,
 *     trainerPayroll?: number,
 *     aerobicPayroll?: number,
 *     hallFinance?: {
 *       pz?: { revenue?: number, payroll?: number, netProfit?: number },
 *       az?: { revenue?: number, payroll?: number, netProfit?: number },
 *     },
 *   } | null,
 *   onSavePlan: () => void,
 *   onSavePlanDirections: () => void,
 *   onSaveFinance: () => void,
 *   savingPlan?: boolean,
 *   savingFinance?: boolean,
 * }} props
 */
export function SalesFinancePanel({
  monthLabel,
  planForm,
  onPlanChange,
  expenseForm,
  onExpenseChange,
  monthSummary,
  onSavePlan,
  onSavePlanDirections,
  onSaveFinance,
  savingPlan = false,
  savingFinance = false,
}) {
  const summary = monthSummary ?? {}

  const setPlan = (key, value) => onPlanChange({ ...planForm, [key]: value })
  const setExpense = (value) => onExpenseChange({ expense_month: value })

  return (
    <section className="sales-report__finance" aria-labelledby="sales-finance-title">
      <h2 className="sales-report__section-title" id="sales-finance-title">
        <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        Финансы клуба
      </h2>
      <p className="sales-report__month-label muted">{monthLabel}</p>

      <div className="sales-finance-settings">
        <SalesFinanceBlock
          step={1}
          title="План по уровням"
          hint="Три порога в ₽ — каждый выше предыдущего. Уровень 3 — финальная цель месяца."
          footer={
            <button type="button" className="btn btn-secondary" onClick={onSavePlan} disabled={savingPlan}>
              <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              {savingPlan ? 'Сохранение…' : 'Сохранить уровни'}
            </button>
          }
        >
          <div className="sales-finance-block__grid sales-finance-block__grid--levels">
            {PLAN_LEVEL_KEYS.map((key, idx) => (
              <div className="sales-finance-block__field" key={key}>
                <label htmlFor={key}>
                  {PLAN_LEVEL_LABELS[idx]}
                  {idx === 2 ? <span className="sales-finance-block__field-tag">финал</span> : null}
                </label>
                <input
                  id={key}
                  type="text"
                  inputMode="decimal"
                  className="sales-finance-block__input"
                  value={planForm[key] ?? ''}
                  onChange={(e) => setPlan(key, e.target.value)}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </SalesFinanceBlock>

        <SalesFinanceBlock
          step={2}
          title="План по направлениям"
          hint="ПЗ, ТЗ, АЗ и доп. продажи — сумма должна совпасть с уровнем 3."
        >
          <SalesPlanDirectionsForm
            embedded
            planForm={planForm}
            onPlanChange={onPlanChange}
            onSave={onSavePlanDirections}
            saving={savingPlan}
          />
        </SalesFinanceBlock>

        <SalesFinanceBlock
          step={3}
          title="Расход управляющего"
          hint="Фиксированный расход клуба за месяц — учитывается в чистой прибыли."
          footer={
            <button type="button" className="btn btn-secondary" onClick={onSaveFinance} disabled={savingFinance}>
              <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              {savingFinance ? 'Сохранение…' : 'Сохранить расход'}
            </button>
          }
        >
          <div className="sales-finance-block__grid sales-finance-block__grid--single">
            <div className="sales-finance-block__field">
              <label htmlFor="expense-month">Сумма за месяц</label>
              <input
                id="expense-month"
                type="text"
                inputMode="decimal"
                className="sales-finance-block__input"
                value={expenseForm.expense_month}
                onChange={(e) => setExpense(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </SalesFinanceBlock>
      </div>

      <div className="sales-report__kpi-grid sales-finance-summary">
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">Заработок месяца</span>
          <span className="sales-report__kpi-value">{formatRub(summary.profitTotal ?? 0)}</span>
          {(summary.refundsTotal ?? 0) > 0 ? (
            <span className="sales-report__kpi-note muted">
              без возвратов {formatRub(summary.profitGrossTotal ?? summary.profitTotal ?? 0)} · возвраты −
              {formatRub(summary.refundsTotal ?? 0)}
            </span>
          ) : null}
        </div>
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
      </div>

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
