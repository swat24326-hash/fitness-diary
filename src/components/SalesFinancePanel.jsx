import { Save, Wallet } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'

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
 *   } | null,
 *   onSavePlan: () => void,
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
  onSaveFinance,
  savingPlan = false,
  savingFinance = false,
}) {
  const summary = monthSummary ?? {}

  const setPlan = (key, value) => onPlanChange({ ...planForm, [key]: value })
  const setExpense = (value) => onExpenseChange({ expense_month: value })

  return (
    <section className="sales-report__finance-divider" aria-labelledby="sales-finance-title">
      <h2 className="sales-report__section-title" id="sales-finance-title">
        <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        Финансы клуба
      </h2>
      <p className="sales-report__month-label muted">{monthLabel}</p>

      <div className="sales-report__card" style={{ marginTop: '1rem' }}>
        <h3 className="sales-report__section-title" style={{ fontSize: '1rem' }}>
          План на месяц
        </h3>
        <div className="sales-report__plan-row">
          <div className="sales-report__metric">
            <label htmlFor="plan-total">Общий (₽)</label>
            <input
              id="plan-total"
              type="text"
              inputMode="decimal"
              value={planForm.plan_total}
              onChange={(e) => setPlan('plan_total', e.target.value)}
            />
          </div>
          <div className="sales-report__metric">
            <label htmlFor="plan-pz">ПЗ (₽)</label>
            <input
              id="plan-pz"
              type="text"
              inputMode="decimal"
              value={planForm.plan_pz}
              onChange={(e) => setPlan('plan_pz', e.target.value)}
            />
          </div>
          <div className="sales-report__metric">
            <label htmlFor="plan-tz">ТЗ (₽)</label>
            <input
              id="plan-tz"
              type="text"
              inputMode="decimal"
              value={planForm.plan_tz}
              onChange={(e) => setPlan('plan_tz', e.target.value)}
            />
          </div>
          <div className="sales-report__metric">
            <label htmlFor="plan-az">АЗ (₽)</label>
            <input
              id="plan-az"
              type="text"
              inputMode="decimal"
              value={planForm.plan_az}
              onChange={(e) => setPlan('plan_az', e.target.value)}
            />
          </div>
        </div>
        <div className="sales-report__actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onSavePlan} disabled={savingPlan}>
            <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {savingPlan ? 'Сохранение…' : 'Сохранить план'}
          </button>
        </div>
      </div>

      <div className="sales-report__card" style={{ marginTop: '0.75rem' }}>
        <h3 className="sales-report__section-title" style={{ fontSize: '1rem' }}>
          Расход управляющего
        </h3>
        <div className="sales-report__metric" style={{ maxWidth: '16rem' }}>
          <label htmlFor="expense-month">Сумма за месяц (₽)</label>
          <input
            id="expense-month"
            type="text"
            inputMode="decimal"
            value={expenseForm.expense_month}
            onChange={(e) => setExpense(e.target.value)}
          />
        </div>
        <div className="sales-report__actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onSaveFinance} disabled={savingFinance}>
            <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {savingFinance ? 'Сохранение…' : 'Сохранить расход'}
          </button>
        </div>
      </div>

      <div className="sales-report__kpi-grid">
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">Заработок месяца</span>
          <span className="sales-report__kpi-value">{formatRub(summary.profitTotal ?? 0)}</span>
        </div>
        <div className="sales-report__kpi">
          <span className="sales-report__kpi-label">Расход</span>
          <span className="sales-report__kpi-value">{formatRub(summary.expense ?? 0)}</span>
        </div>
        <div className="sales-report__kpi sales-report__kpi--primary">
          <span className="sales-report__kpi-label">Чистая прибыль</span>
          <span className="sales-report__kpi-value">{formatRub(summary.netProfit ?? 0)}</span>
        </div>
      </div>

      <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        НК {formatRub(summary.profitNk ?? 0)} · ДК {formatRub(summary.profitDk ?? 0)} · УК{' '}
        {formatRub(summary.profitUk ?? 0)} · тренировок {summary.trainingsTotal ?? 0}
      </p>
    </section>
  )
}
