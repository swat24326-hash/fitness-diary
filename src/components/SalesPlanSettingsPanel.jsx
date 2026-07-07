import { Save, Target } from 'lucide-react'
import { PLAN_LEVEL_KEYS, PLAN_LEVEL_LABELS } from '../lib/admin/salesReportCore.js'
import { SalesFinanceBlock } from './SalesFinanceBlock.jsx'
import { SalesPlanDirectionsForm } from './SalesPlanDirectionsForm.jsx'

/**
 * @param {{
 *   monthLabel: string,
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   expenseForm: Record<string, string>,
 *   onExpenseChange: (next: Record<string, string>) => void,
 *   onSavePlan: () => void,
 *   onSavePlanDirections: () => void,
 *   onSaveFinance: () => void,
 *   savingPlan?: boolean,
 *   savingFinance?: boolean,
 * }} props
 */
export function SalesPlanSettingsPanel({
  monthLabel,
  planForm,
  onPlanChange,
  expenseForm,
  onExpenseChange,
  onSavePlan,
  onSavePlanDirections,
  onSaveFinance,
  savingPlan = false,
  savingFinance = false,
}) {
  const setPlan = (key, value) => onPlanChange({ ...planForm, [key]: value })
  const setExpense = (value) => onExpenseChange({ expense_month: value })

  return (
    <section className="sales-report__finance" aria-labelledby="sales-plan-settings-title">
      <h2 className="sales-report__section-title" id="sales-plan-settings-title">
        <Target size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        План месяца
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
                <label htmlFor={`plan-settings-${key}`}>
                  {PLAN_LEVEL_LABELS[idx]}
                  {idx === 2 ? <span className="sales-finance-block__field-tag">финал</span> : null}
                </label>
                <input
                  id={`plan-settings-${key}`}
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
              <label htmlFor="plan-settings-expense-month">Сумма за месяц</label>
              <input
                id="plan-settings-expense-month"
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
    </section>
  )
}
