import { useMemo } from 'react'
import { Save } from 'lucide-react'
import {
  evaluatePlanDirectionsForm,
  formatRub,
  SALES_MATRIX_COLS,
  SALES_MATRIX_HALL_ROWS,
} from '../lib/admin/salesReportCore.js'
import {
  planMatrixAvgField,
  planMatrixCellRubFromForm,
  planMatrixCountField,
} from '../lib/admin/salesPlanMatrixCore.js'

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
  const {
    finalTarget,
    directionSum,
    noFinal,
    meetsMinimum,
    directionsBelow,
    exactMatch,
    surplus,
    shortfall,
    canSave,
    hallTotals,
  } = directions

  const statusClass = directionsBelow || (finalTarget > 0 && directionSum <= 0)
    ? ' sales-report__plan-sum-hint--warn'
    : meetsMinimum
      ? ' sales-report__plan-sum-hint--ok'
      : ''

  const body = (
    <>
      {noFinal ? (
        <p className="sales-report__plan-sum-hint sales-report__plan-sum-hint--warn" role="status">
          Сначала задайте уровень 3 в блоке «План по уровням».
        </p>
      ) : null}
      <div className="sales-report__matrix-scroll sales-report__matrix-scroll--plan">
        <table className="sales-report__matrix sales-report__matrix--plan">
          <thead>
            <tr>
              <th rowSpan={2} className="sales-report__matrix-row-label" scope="col" />
              {SALES_MATRIX_COLS.map((col) => (
                <th key={col.suffix} colSpan={3} className={`sales-report__matrix-group-head sales-report__matrix-group-head--${col.suffix}`} scope="col">
                  {col.label}
                </th>
              ))}
              <th rowSpan={2} className="sales-report__matrix-summary-head" scope="col">
                Итого
              </th>
            </tr>
            <tr>
              {SALES_MATRIX_COLS.flatMap((col) => [
                <th key={`${col.suffix}-cnt`} className="sales-report__matrix-subhead" scope="col">
                  шт
                </th>,
                <th key={`${col.suffix}-avg`} className="sales-report__matrix-subhead" scope="col">
                  ср. чек
                </th>,
                <th key={`${col.suffix}-sum`} className="sales-report__matrix-subhead" scope="col">
                  ₽
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {SALES_MATRIX_HALL_ROWS.map((row) => {
              const hallTotal = hallTotals?.[row.key]?.amount ?? 0
              return (
                <tr key={row.key}>
                  <th className="sales-report__matrix-row-label" scope="row">
                    {row.label}
                  </th>
                  {SALES_MATRIX_COLS.flatMap((col) => {
                    const cellKey = `${row.key}_${col.suffix}`
                    const countField = planMatrixCountField(cellKey)
                    const avgField = planMatrixAvgField(cellKey)
                    const cellRub = planMatrixCellRubFromForm(planForm, cellKey)
                    return [
                      <td key={`${cellKey}-cnt`} className="sales-report__matrix-field">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="sales-report__matrix-input"
                          aria-label={`${row.label} ${col.label} количество`}
                          value={planForm[countField] ?? ''}
                          onChange={(e) => setPlan(countField, e.target.value)}
                          disabled={noFinal}
                          placeholder="0"
                        />
                      </td>,
                      <td key={`${cellKey}-avg`} className="sales-report__matrix-field">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="sales-report__matrix-input"
                          aria-label={`${row.label} ${col.label} средний чек`}
                          value={planForm[avgField] ?? ''}
                          onChange={(e) => setPlan(avgField, e.target.value)}
                          disabled={noFinal}
                          placeholder="0"
                        />
                      </td>,
                      <td key={`${cellKey}-sum`} className="sales-report__matrix-computed sales-report__matrix-cell-avg">
                        {cellRub > 0 ? formatRub(cellRub) : '—'}
                      </td>,
                    ]
                  })}
                  <td className="sales-report__matrix-computed sales-report__matrix-row-total">
                    <strong>{hallTotal > 0 ? formatRub(hallTotal) : '—'}</strong>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sales-finance-block__field sales-finance-block__field--extra" style={{ marginTop: '0.75rem' }}>
        <label htmlFor="plan_extra">
          Доп.
          <span className="sales-finance-block__field-sub muted">доп. продажи, ₽</span>
        </label>
        <input
          id="plan_extra"
          type="text"
          inputMode="decimal"
          className="sales-finance-block__input"
          value={planForm.plan_extra ?? ''}
          onChange={(e) => setPlan('plan_extra', e.target.value)}
          placeholder="0"
          disabled={noFinal}
        />
      </div>
      <div className="sales-finance-block__foot sales-finance-block__foot--inline">
        <p className={`sales-report__plan-sum-hint${statusClass}`} role="status">
          Сумма: {directionSum > 0 ? formatRub(directionSum) : '—'}
          {finalTarget > 0 ? ` · минимум ${formatRub(finalTarget)}` : ''}
          {directionsBelow && shortfall > 0 ? ` · не хватает ${formatRub(shortfall)}` : ''}
          {meetsMinimum && surplus > 0 ? ` · выше финала на ${formatRub(surplus)}` : ''}
          {exactMatch ? ' · минимум достигнут' : ''}
          {meetsMinimum && !exactMatch && surplus <= 0 ? ' · минимум достигнут' : ''}
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
