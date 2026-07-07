import { useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Save, Users } from 'lucide-react'
import {
  computeProfitFromMatrix,
  formatRub,
  SALES_DOP_FORM_SUM_KEY,
  SALES_REFUNDS_FORM_KEY,
  SALES_DOP_ROW,
  SALES_MATRIX_COLS,
  SALES_MATRIX_HALL_ROWS,
  salesMatrixCellAvgCheck,
  salesMatrixCellKeys,
  salesMatrixRowAvgCheck,
  salesMatrixRowMembershipTotal,
  salesMatrixRowSumTotal,
} from '../lib/admin/salesReportCore.js'
import { SalesTrainingsMatrix } from './SalesTrainingsMatrix.jsx'
import { SalesAerobicMatrix } from './SalesAerobicMatrix.jsx'

const MATRIX_HALL_ROWS = SALES_MATRIX_HALL_ROWS
const MATRIX_COLS = SALES_MATRIX_COLS

function MatrixEmptyCells({ prefix }) {
  return MATRIX_COLS.flatMap((col) => [
    <td key={`${prefix}-${col.suffix}-cnt`} className="sales-report__matrix-computed sales-report__matrix-cell-empty" />,
    <td key={`${prefix}-${col.suffix}-sum`} className="sales-report__matrix-computed sales-report__matrix-cell-empty" />,
    <td key={`${prefix}-${col.suffix}-avg`} className="sales-report__matrix-computed sales-report__matrix-cell-empty" />,
  ])
}

/**
 * @param {{
 *   reportDate: string,
 *   dateLabel: string,
 *   form: Record<string, string>,
 *   onFormChange: (next: Record<string, string>) => void,
 *   onPrevDay: () => void,
 *   onNextDay: () => void,
 *   onDateChange: (iso: string) => void,
 *   onSave: () => void,
 *   saving?: boolean,
 *   canEdit?: boolean,
 *   trainers?: object[],
 *   membershipTypes?: object[],
 *   membershipTypeColumns?: Array<{ typeId: string, code: string }>,
 *   trainingsMatrix?: Record<string, string>,
 *   onTrainingsMatrixChange?: (next: Record<string, string>) => void,
 *   aerobicMatrix?: Record<string, string>,
 *   onAerobicMatrixChange?: (next: Record<string, string>) => void,
 *   aerobicMembershipTypes?: object[],
 *   aerobicTypeColumns?: Array<{ typeId: string, code: string }>,
 *   fitCityTypeStats?: object | null,
 *   clubId?: string,
 *   showPayroll?: boolean,
 * }} props
 */
export function SalesDailyForm({
  reportDate,
  dateLabel,
  form,
  onFormChange,
  onPrevDay,
  onNextDay,
  onDateChange,
  onSave,
  saving = false,
  canEdit = true,
  trainers = [],
  membershipTypes = [],
  membershipTypeColumns = [],
  trainingsMatrix = {},
  onTrainingsMatrixChange,
  aerobicMatrix = {},
  onAerobicMatrixChange,
  aerobicMembershipTypes = [],
  aerobicTypeColumns = [],
  fitCityTypeStats = null,
  clubId = '',
  showPayroll = true,
}) {
  const profit = useMemo(() => {
    const calc = computeProfitFromMatrix(form)
    if (!calc.ok) {
      return { profit_nk: 0, profit_dk: 0, profit_uk: 0, profit_day: 0, profit_day_gross: 0, refunds_amount: 0 }
    }
    return calc
  }, [form])

  const setField = (key, value) => onFormChange({ ...form, [key]: value })

  return (
    <section className="sales-report__card" aria-labelledby="sales-daily-title">
      <h2 className="sales-report__section-title" id="sales-daily-title">
        Отчёт за день
      </h2>

      <div className="sales-report__date-stepper">
        <button type="button" className="sales-report__date-btn" onClick={onPrevDay} aria-label="Предыдущий день">
          <ChevronLeft size={18} />
        </button>
        <label className="sales-report__date-pill">
          <Calendar size={16} aria-hidden />
          <span className="sales-report__date-text">{dateLabel}</span>
          <input
            type="date"
            className="sales-report__date-input-overlay"
            value={reportDate}
            onChange={(e) => onDateChange(e.target.value)}
            aria-label="Дата отчёта"
          />
        </label>
        <button type="button" className="sales-report__date-btn" onClick={onNextDay} aria-label="Следующий день">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="sales-report__mini-row" style={{ marginTop: '1rem' }}>
        <div className="sales-report__mini-card">
          <Users size={22} aria-hidden />
          <div className="sales-report__metric" style={{ flex: 1 }}>
            <label htmlFor="sales-pnk">ПНК (шт)</label>
            <input
              id="sales-pnk"
              type="text"
              inputMode="numeric"
              value={form.pnk_total}
              onChange={(e) => setField('pnk_total', e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h3 className="sales-report__section-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
          Тренировки по типам карт
        </h3>
        <SalesTrainingsMatrix
          trainers={trainers}
          columns={membershipTypeColumns}
          membershipTypes={membershipTypes}
          matrix={trainingsMatrix}
          onMatrixChange={onTrainingsMatrixChange ?? (() => {})}
          fitCityStats={fitCityTypeStats}
          canEdit={canEdit}
          aggregateOnly
          clubId={clubId}
          showPayroll={showPayroll}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h3 className="sales-report__section-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
          Тренировки в аэробном зале
        </h3>
        <SalesAerobicMatrix
          columns={aerobicTypeColumns}
          membershipTypes={aerobicMembershipTypes}
          matrix={aerobicMatrix}
          onMatrixChange={onAerobicMatrixChange ?? (() => {})}
          canEdit={canEdit}
          clubId={clubId}
          showPayroll={showPayroll}
        />
      </div>

      <h3 className="sales-report__section-title sales-report__matrix-heading">
        Матрица продаж
      </h3>
      <div className="table-wrap sales-report__matrix-wrap">
        <table className="sales-report__matrix sales-report__matrix--flat">
          <thead>
            <tr>
              <th rowSpan={2} className="sales-report__matrix-row-label" />
              {MATRIX_COLS.map((c) => (
                <th key={c.suffix} colSpan={3} className="sales-report__matrix-group-head">
                  {c.label}
                </th>
              ))}
              <th rowSpan={2} className="sales-report__matrix-summary-head">
                Абон.
              </th>
              <th rowSpan={2} className="sales-report__matrix-summary-head">
                Ср. чек
              </th>
              <th rowSpan={2} className="sales-report__matrix-summary-head sales-report__matrix-summary-head--total">
                Итого
              </th>
            </tr>
            <tr>
              {MATRIX_COLS.flatMap((c) => [
                <th key={`${c.suffix}-cnt`} className="sales-report__matrix-subhead">
                  шт
                </th>,
                <th key={`${c.suffix}-sum`} className="sales-report__matrix-subhead">
                  ₽
                </th>,
                <th key={`${c.suffix}-avg`} className="sales-report__matrix-subhead">
                  ср.
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {MATRIX_HALL_ROWS.map((row) => {
              const rowTotal = salesMatrixRowMembershipTotal(form, row.key)
              const rowAvg = salesMatrixRowAvgCheck(form, row.key)
              const rowSum = salesMatrixRowSumTotal(form, row.key)
              return (
                <tr key={row.key}>
                  <td className="sales-report__matrix-row-label">{row.label}</td>
                  {MATRIX_COLS.flatMap((col) => {
                    const { countKey, sumKey } = salesMatrixCellKeys(row.key, col.suffix)
                    const cellAvg = salesMatrixCellAvgCheck(form, countKey)
                    return [
                      <td key={`${countKey}-cnt`} className="sales-report__matrix-field">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="sales-report__matrix-input"
                          aria-label={`${row.label} ${col.label} количество`}
                          value={form[countKey] ?? ''}
                          onChange={(e) => setField(countKey, e.target.value)}
                          disabled={!canEdit}
                          placeholder="0"
                        />
                      </td>,
                      <td key={`${countKey}-sum`} className="sales-report__matrix-field">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="sales-report__matrix-input"
                          aria-label={`${row.label} ${col.label} сумма`}
                          value={form[sumKey] ?? ''}
                          onChange={(e) => setField(sumKey, e.target.value)}
                          disabled={!canEdit}
                          placeholder="0"
                        />
                      </td>,
                      <td key={`${countKey}-avg`} className="sales-report__matrix-computed sales-report__matrix-cell-avg">
                        {cellAvg != null ? formatRub(cellAvg) : '—'}
                      </td>,
                    ]
                  })}
                  <td className="sales-report__matrix-computed">
                    <strong>{rowTotal > 0 ? rowTotal : '—'}</strong>
                  </td>
                  <td className="sales-report__matrix-computed">
                    <strong>{rowAvg != null ? formatRub(rowAvg) : '—'}</strong>
                  </td>
                  <td className="sales-report__matrix-computed sales-report__matrix-row-total">
                    <strong>{rowSum > 0 ? formatRub(rowSum) : '—'}</strong>
                  </td>
                </tr>
              )
            })}
            <tr className="sales-report__matrix-extra-row">
              <td className="sales-report__matrix-row-label">{SALES_DOP_ROW.label}</td>
              <MatrixEmptyCells prefix="dop" />
              <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
              <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
              <td className="sales-report__matrix-field sales-report__matrix-total-field">
                <input
                  type="text"
                  inputMode="decimal"
                  className="sales-report__matrix-input"
                  aria-label="Доп. продажи сумма за день"
                  value={form[SALES_DOP_FORM_SUM_KEY] ?? ''}
                  onChange={(e) => setField(SALES_DOP_FORM_SUM_KEY, e.target.value)}
                  disabled={!canEdit}
                  placeholder="0"
                />
              </td>
            </tr>
            <tr className="sales-report__matrix-extra-row">
              <td className="sales-report__matrix-row-label">Возвраты</td>
              <MatrixEmptyCells prefix="refunds" />
              <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
              <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
              <td className="sales-report__matrix-field sales-report__matrix-total-field">
                <input
                  type="text"
                  inputMode="decimal"
                  className="sales-report__matrix-input sales-report__matrix-input--refunds"
                  aria-label="Возвраты за день"
                  value={form[SALES_REFUNDS_FORM_KEY] ?? ''}
                  onChange={(e) => setField(SALES_REFUNDS_FORM_KEY, e.target.value)}
                  disabled={!canEdit}
                  placeholder="0"
                />
              </td>
            </tr>
            <tr className="sales-report__matrix-profit-row">
              <td className="sales-report__matrix-row-label">Прибыль (₽)</td>
              {MATRIX_COLS.map((col) => (
                <td key={col.suffix} colSpan={3} className="sales-report__matrix-computed">
                  <strong>{formatRub(profit[`profit_${col.suffix}`])}</strong>
                </td>
              ))}
              <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
              <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
              <td className="sales-report__matrix-computed sales-report__matrix-row-total">
                <strong>{formatRub(profit.profit_day_gross ?? profit.profit_day)}</strong>
              </td>
            </tr>
            {(Number(profit.refunds_amount) || 0) > 0 ? (
              <tr className="sales-report__matrix-profit-row sales-report__matrix-profit-row--net">
                <td className="sales-report__matrix-row-label">Итого за день</td>
                <MatrixEmptyCells prefix="net" />
                <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
                <td className="sales-report__matrix-computed sales-report__matrix-cell-empty" />
                <td className="sales-report__matrix-computed sales-report__matrix-row-total">
                  <strong>{formatRub(profit.profit_day)}</strong>
                  <span className="sales-report__matrix-profit-note muted">с учётом возвратов</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="sales-report__actions" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {saving ? 'Сохранение…' : 'Сохранить отчёт'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
