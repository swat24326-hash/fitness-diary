import { useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Save, Users } from 'lucide-react'
import {
  computeProfitFromMatrix,
  formatRub,
  SALES_MATRIX_COLS,
  SALES_MATRIX_ROWS,
  salesMatrixColumnTotals,
  salesMatrixRowAvgCheck,
  salesMatrixRowMembershipTotal,
} from '../lib/admin/salesReportCore.js'
import { SalesTrainingsMatrix } from './SalesTrainingsMatrix.jsx'

const MATRIX_ROWS = SALES_MATRIX_ROWS
const MATRIX_COLS = SALES_MATRIX_COLS

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
 *   fitCityTypeStats?: object | null,
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
  fitCityTypeStats = null,
}) {
  const profit = useMemo(() => {
    const calc = computeProfitFromMatrix(form)
    if (!calc.ok) {
      return { profit_nk: 0, profit_dk: 0, profit_uk: 0, profit_day: 0 }
    }
    return calc
  }, [form])

  const columnTotals = useMemo(() => salesMatrixColumnTotals(form), [form])

  const setField = (key, value) => {
    onFormChange({ ...form, [key]: value })
  }

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
        />
      </div>

      <p className="muted" style={{ margin: '1rem 0 0.5rem', fontSize: '0.85rem' }}>
        Матрица продаж — количество абонементов и средний чек по категории клиента (НК / ДК / УК). Прибыль
        считается автоматически.
      </p>
      <table className="sales-report__matrix">
        <thead>
          <tr>
            <th />
            {MATRIX_COLS.map((c) => (
              <th key={c.suffix}>{c.label}</th>
            ))}
            <th>Абон.</th>
            <th>Ср. чек</th>
          </tr>
        </thead>
        <tbody>
          {MATRIX_ROWS.map((row) => {
            const rowTotal = salesMatrixRowMembershipTotal(form, row.key)
            const rowAvg = salesMatrixRowAvgCheck(form, row.key)
            return (
              <tr key={row.key}>
                <td>{row.label}</td>
                {MATRIX_COLS.map((col) => {
                  const field = `${row.key}_${col.suffix}`
                  return (
                    <td key={field}>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${row.label} ${col.label}`}
                        value={form[field] ?? ''}
                        onChange={(e) => setField(field, e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                  )
                })}
                <td className="sales-report__matrix-computed">
                  <strong>{rowTotal > 0 ? rowTotal : '—'}</strong>
                </td>
                <td className="sales-report__matrix-computed">
                  <strong>{rowAvg != null ? formatRub(rowAvg) : '—'}</strong>
                </td>
              </tr>
            )
          })}
          <tr className="sales-report__matrix-avg-row">
            <td>Ср. чек (₽)</td>
            {MATRIX_COLS.map((col) => {
              const field = `avg_check_${col.suffix}`
              return (
                <td key={field}>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Средний чек ${col.label}`}
                    value={form[field] ?? ''}
                    onChange={(e) => setField(field, e.target.value)}
                    disabled={!canEdit}
                    placeholder={columnTotals[col.suffix] > 0 ? '0' : '—'}
                  />
                </td>
              )
            })}
            <td className="sales-report__matrix-computed muted">—</td>
            <td className="sales-report__matrix-computed muted">—</td>
          </tr>
          <tr className="sales-report__matrix-profit-row">
            <td>Прибыль (₽)</td>
            {MATRIX_COLS.map((col) => (
              <td key={col.suffix} className="sales-report__matrix-computed">
                <strong>{formatRub(profit[`profit_${col.suffix}`])}</strong>
              </td>
            ))}
            <td colSpan={2} className="sales-report__matrix-computed sales-report__matrix-profit-total">
              <strong>{formatRub(profit.profit_day)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="sales-report__metric-total" style={{ marginTop: '1rem' }}>
        <span>Итого за день</span>
        <strong>{formatRub(profit.profit_day)}</strong>
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
