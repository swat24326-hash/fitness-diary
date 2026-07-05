import { useMemo } from 'react'
import { Save } from 'lucide-react'
import { evaluatePlanDirectionsForm, formatRub } from '../lib/admin/salesReportCore.js'

const DIRECTION_FIELDS = [
  { key: 'plan_pz', label: 'ПЗ', hint: 'персональный зал' },
  { key: 'plan_tz', label: 'ТЗ', hint: 'тренажёрный зал' },
  { key: 'plan_az', label: 'АЗ', hint: 'аэробный зал' },
]

/**
 * @param {{
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   onSave: () => void,
 *   saving?: boolean,
 * }} props
 */
export function SalesPlanDirectionsForm({ planForm, onPlanChange, onSave, saving = false }) {
  const setPlan = (key, value) => onPlanChange({ ...planForm, [key]: value })

  const directions = useMemo(() => evaluatePlanDirectionsForm(planForm), [planForm])
  const { finalTarget, directionSum, noFinal, directionsMismatch, exactMatch, canSave } = directions

  return (
    <section
      className="sales-report__card sales-report__plan-card"
      style={{ marginBottom: '1rem' }}
      aria-labelledby="sales-plan-directions-title"
    >
      <h2 className="sales-report__section-title" id="sales-plan-directions-title" style={{ fontSize: '1rem' }}>
        План по направлениям
      </h2>
      <p className="muted sales-report__plan-card-note">
        Менеджер раскидывает <strong>финальный план</strong> (уровень 3) по залам: ПЗ + ТЗ + АЗ. Сумма должна{' '}
        <strong>ровно</strong> совпадать с финалом — ни больше, ни меньше.
      </p>
      {noFinal ? (
        <p className="sales-report__plan-sum-hint sales-report__plan-sum-hint--warn" role="status">
          Финал (ур. 3) ещё не задан — управляющий заполняет уровни во вкладке «Финансы клуба».
        </p>
      ) : (
        <p className="muted sales-report__plan-card-note" role="status">
          Финал (ур. 3): <strong>{formatRub(finalTarget)}</strong>
        </p>
      )}
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
              disabled={noFinal}
            />
          </div>
        ))}
      </div>
      <p
        className={`sales-report__plan-sum-hint${
          directionsMismatch || (finalTarget > 0 && directionSum <= 0) ? ' sales-report__plan-sum-hint--warn' : ''
        }${exactMatch ? ' sales-report__plan-sum-hint--ok' : ''}`}
        role="status"
      >
        Сумма направлений: {directionSum > 0 ? formatRub(directionSum) : '—'}
        {finalTarget > 0 ? ` · финал ${formatRub(finalTarget)}` : ''}
        {directionsMismatch ? ' · не совпадает с финалом' : ''}
        {exactMatch ? ' · совпадает' : ''}
      </p>
      <div className="sales-report__actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onSave} disabled={saving || !canSave}>
          <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          {saving ? 'Сохранение…' : 'Сохранить план'}
        </button>
      </div>
    </section>
  )
}
