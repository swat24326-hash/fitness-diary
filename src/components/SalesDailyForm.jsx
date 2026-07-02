import { Calendar, ChevronLeft, ChevronRight, Save, Users } from 'lucide-react'
import { computeProfitDay, formatRub } from '../lib/admin/salesReportCore.js'
import { SalesTrainingsMatrix } from './SalesTrainingsMatrix.jsx'

const MATRIX_ROWS = [
  { key: 'pz', label: 'ПЗ' },
  { key: 'tz', label: 'ТЗ' },
  { key: 'az', label: 'АЗ' },
]
const MATRIX_COLS = [
  { suffix: 'nk', label: 'НК' },
  { suffix: 'dk', label: 'ДК' },
  { suffix: 'uk', label: 'УК' },
]

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
  membershipTypeColumns = [],
  trainingsMatrix = {},
  onTrainingsMatrixChange,
  fitCityTypeStats = null,
}) {
  const profitTotal = computeProfitDay(form.profit_nk, form.profit_dk, form.profit_uk)

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
        <div className="sales-report__date-pill">
          <Calendar size={16} aria-hidden />
          <input
            type="date"
            value={reportDate}
            onChange={(e) => onDateChange(e.target.value)}
            aria-label="Дата отчёта"
          />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {dateLabel}
          </span>
        </div>
        <button type="button" className="sales-report__date-btn" onClick={onNextDay} aria-label="Следующий день">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="sales-report__profit-grid" style={{ marginTop: '1rem' }}>
        <div className="sales-report__metric">
          <label htmlFor="sales-profit-nk">Прибыль НК (₽)</label>
          <input
            id="sales-profit-nk"
            type="text"
            inputMode="decimal"
            value={form.profit_nk}
            onChange={(e) => setField('profit_nk', e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="sales-report__metric">
          <label htmlFor="sales-profit-dk">Прибыль ДК (₽)</label>
          <input
            id="sales-profit-dk"
            type="text"
            inputMode="decimal"
            value={form.profit_dk}
            onChange={(e) => setField('profit_dk', e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="sales-report__metric">
          <label htmlFor="sales-profit-uk">Прибыль УК (₽)</label>
          <input
            id="sales-profit-uk"
            type="text"
            inputMode="decimal"
            value={form.profit_uk}
            onChange={(e) => setField('profit_uk', e.target.value)}
            disabled={!canEdit}
          />
        </div>
      </div>
      <div className="sales-report__metric-total">
        <span>Итого за день</span>
        <strong>{formatRub(profitTotal)}</strong>
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
          matrix={trainingsMatrix}
          onMatrixChange={onTrainingsMatrixChange ?? (() => {})}
          fitCityStats={fitCityTypeStats}
          canEdit={canEdit}
        />
      </div>

      <p className="muted" style={{ margin: '1rem 0 0.5rem', fontSize: '0.85rem' }}>
        Матрица продаж (шт)
      </p>
      <table className="sales-report__matrix">
        <thead>
          <tr>
            <th />
            {MATRIX_COLS.map((c) => (
              <th key={c.suffix}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX_ROWS.map((row) => (
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
            </tr>
          ))}
        </tbody>
      </table>

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
