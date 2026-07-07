import { useMemo } from 'react'
import { Save } from 'lucide-react'
import { evaluatePlanDirectionsForm, formatRub } from '../lib/admin/salesReportCore.js'

const DIRECTION_FIELDS = [
  { key: 'plan_pz', label: 'ПЗ', hint: 'персональный зал', tone: 'pz' },
  { key: 'plan_tz', label: 'ТЗ', hint: 'тренажёрный зал', tone: 'tz' },
  { key: 'plan_az', label: 'АЗ', hint: 'аэробный зал', tone: 'az' },
  { key: 'plan_extra', label: 'Доп.', hint: 'доп. продажи', tone: 'extra' },
]

/**
 * @param {{
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   onSave: () => void,
 *   saving?: boolean,
 *   embedded?: boolean,
 * }} props
 */
export function SalesPlanDirectionsForm({
  planForm,
  onPlanChange,
  onSave,
  saving = false,
  embedded = false,
}) {
  const setPlan = (key, value) => onPlanChange({ ...planForm, [key]: value })

  const directions = useMemo(() => evaluatePlanDirectionsForm(planForm), [planForm])
  const { finalTarget, directionSum, noFinal, directionsMismatch, exactMatch, canSave } = directions

  const statusClass = directionsMismatch || (finalTarget > 0 && directionSum <= 0)
    ? ' sales-report__plan-sum-hint--warn'
    : exactMatch
      ? ' sales-report__plan-sum-hint--ok'
      : ''

  const body = (
    <>
      {noFinal ? (
        <p className="sales-report__plan-sum-hint sales-report__plan-sum-hint--warn" role="status">
          Сначала задайте уровень 3 в блоке «План по уровням».
        </p>
      ) : null}
      <div className="sales-finance-block__grid sales-finance-block__grid--directions">
        {DIRECTION_FIELDS.map(({ key, label, hint, tone }) => (
          <div className={`sales-finance-block__field sales-finance-block__field--${tone}`} key={key}>
            <label htmlFor={key}>
              {label}
              <span className="sales-finance-block__field-sub muted">{hint}</span>
            </label>
            <input
              id={key}
              type="text"
              inputMode="decimal"
              className="sales-finance-block__input"
              value={planForm[key] ?? ''}
              onChange={(e) => setPlan(key, e.target.value)}
              placeholder="0"
              disabled={noFinal}
            />
          </div>
        ))}
      </div>
      <div className="sales-finance-block__foot sales-finance-block__foot--inline">
        <p className={`sales-report__plan-sum-hint${statusClass}`} role="status">
          Сумма: {directionSum > 0 ? formatRub(directionSum) : '—'}
          {finalTarget > 0 && !exactMatch ? ` · нужно ${formatRub(finalTarget)}` : ''}
          {directionsMismatch ? ' · не совпадает' : ''}
          {exactMatch ? ' · совпадает с финалом' : ''}
        </p>
        <button type="button" className="btn btn-secondary" onClick={onSave} disabled={saving || !canSave}>
          <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          {saving ? 'Сохранение…' : 'Сохранить направления'}
        </button>
      </div>
    </>
  )

  if (embedded) return body

  return (
    <section
      className="sales-report__card sales-report__plan-card"
      style={{ marginBottom: '1rem' }}
      aria-labelledby="sales-plan-directions-title"
    >
      <h2 className="sales-report__section-title" id="sales-plan-directions-title" style={{ fontSize: '1rem' }}>
        План по направлениям
      </h2>
      {body}
    </section>
  )
}
