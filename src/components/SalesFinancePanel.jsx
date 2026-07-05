import { useMemo } from 'react'
import { Save, Wallet } from 'lucide-react'
import {
  PLAN_LEVEL_KEYS,
  PLAN_LEVEL_LABELS,
  formatRub,
  resolvePlanFinalTarget,
  sumPlanDirections,
} from '../lib/admin/salesReportCore.js'

const DIRECTION_FIELDS = [
  { key: 'plan_pz', label: 'ПЗ', hint: 'персональный зал' },
  { key: 'plan_tz', label: 'ТЗ', hint: 'тренажёрный зал' },
  { key: 'plan_az', label: 'АЗ', hint: 'аэробный зал' },
]

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

  const planFinal = useMemo(() => resolvePlanFinalTarget(planForm), [planForm])
  const directionSum = useMemo(() => sumPlanDirections(planForm), [planForm])
  const directionsMismatch =
    planFinal > 0 && directionSum > 0 && Math.abs(directionSum - planFinal) > 0.009

  return (
    <section className="sales-report__finance" aria-labelledby="sales-finance-title">
      <h2 className="sales-report__section-title" id="sales-finance-title">
        <Wallet size={20} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden />
        Финансы клуба
      </h2>
      <p className="sales-report__month-label muted">{monthLabel}</p>

      <div className="sales-report__card sales-report__plan-card" style={{ marginTop: '1rem' }}>
        <h3 className="sales-report__section-title" style={{ fontSize: '1rem' }}>
          План по уровням
        </h3>
        <p className="muted sales-report__plan-card-note">
          Управляющий задаёт <strong>три порога</strong> (₽): каждый следующий выше предыдущего. Это{' '}
          <strong>не сумма</strong>, а этапы повышения. Уровень 3 — финальная цель месяца.
        </p>
        <div className="sales-report__plan-row sales-report__plan-row--levels">
          {PLAN_LEVEL_KEYS.map((key, idx) => (
            <div className="sales-report__metric" key={key}>
              <label htmlFor={key}>
                {PLAN_LEVEL_LABELS[idx]}
                {idx === 2 ? <span className="muted"> (финал)</span> : null}
              </label>
              <input
                id={key}
                type="text"
                inputMode="decimal"
                value={planForm[key] ?? ''}
                onChange={(e) => setPlan(key, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="sales-report__card sales-report__plan-card" style={{ marginTop: '0.75rem' }}>
        <h3 className="sales-report__section-title" style={{ fontSize: '1rem' }}>
          План по направлениям
        </h3>
        <p className="muted sales-report__plan-card-note">
          Менеджер раскидывает <strong>финальный план</strong> (уровень 3) по залам: ПЗ + ТЗ + АЗ.
        </p>
        <div className="sales-report__plan-row">
          {DIRECTION_FIELDS.map(({ key, label, hint }) => (
            <div className="sales-report__metric" key={key}>
              <label htmlFor={key}>
                {label} <span className="muted">({hint})</span>
              </label>
              <input
                id={key}
                type="text"
                inputMode="decimal"
                value={planForm[key] ?? ''}
                onChange={(e) => setPlan(key, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <p
          className={`sales-report__plan-sum-hint${directionsMismatch ? ' sales-report__plan-sum-hint--warn' : ''}`}
          role="status"
        >
          Сумма направлений: {directionSum > 0 ? formatRub(directionSum) : '—'}
          {planFinal > 0 ? ` · финал (ур. 3) ${formatRub(planFinal)}` : ''}
          {directionsMismatch ? ' · не совпадает с финалом' : ''}
        </p>
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
          <span className="sales-report__kpi-label">ФОТ тренеров</span>
          <span className="sales-report__kpi-value">{formatRub(summary.trainerPayroll ?? 0)}</span>
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

      <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        НК {formatRub(summary.profitNk ?? 0)} · ДК {formatRub(summary.profitDk ?? 0)} · УК{' '}
        {formatRub(summary.profitUk ?? 0)} · тренировок {summary.trainingsTotal ?? 0} · ФОТ по текущим
        ставкам типов абонементов
      </p>
    </section>
  )
}
