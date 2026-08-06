import { Plus, Save, Trash2 } from 'lucide-react'
import { SalesFinanceBlock } from './SalesFinanceBlock.jsx'
import {
  SALES_PROMO_SEGMENT_KEYS,
  emptySalesPromotionDraft,
  salesPromoSegmentLabel,
} from '../lib/admin/salesPromotionsCore.js'

/**
 * CRUD акций в плане месяца.
 * @param {{
 *   year: number,
 *   month: number,
 *   promotions: Array<Record<string, unknown>>,
 *   onChange: (next: Array<Record<string, unknown>>) => void,
 *   onSave: () => void,
 *   saving?: boolean,
 *   canEdit?: boolean,
 *   step?: number | string,
 * }} props
 */
export function SalesPlanPromotionsSection({
  year,
  month,
  promotions = [],
  onChange,
  onSave,
  saving = false,
  canEdit = true,
  step = 3,
}) {
  const list = Array.isArray(promotions) ? promotions : []

  const updateAt = (idx, patch) => {
    const next = list.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    onChange(next)
  }

  const removeAt = (idx) => {
    onChange(list.filter((_, i) => i !== idx))
  }

  const addRow = () => {
    onChange([...list, emptySalesPromotionDraft({ year, month })])
  }

  return (
    <SalesFinanceBlock
      step={step}
      title="Акции"
      hint="Сроки и цель в штуках. Не входят в матрицу направлений и ур. 3 — отдельный разрез «заложено / продано»."
      footer={
        canEdit ? (
          <button type="button" className="btn btn-secondary" onClick={onSave} disabled={saving}>
            <Save size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {saving ? 'Сохранение…' : 'Сохранить акции'}
          </button>
        ) : null
      }
    >
      {list.length === 0 ? (
        <p className="muted sales-promotions__empty">Пока нет акций на месяц.</p>
      ) : (
        <ul className="sales-promotions__list">
          {list.map((row, idx) => (
            <li key={String(row.id || idx)} className="sales-promotions__row">
              <div className="sales-finance-block__field sales-promotions__field--name">
                <label htmlFor={`promo-name-${idx}`}>Название</label>
                <input
                  id={`promo-name-${idx}`}
                  type="text"
                  className="sales-finance-block__input"
                  value={String(row.name ?? '')}
                  disabled={!canEdit}
                  onChange={(e) => updateAt(idx, { name: e.target.value })}
                  placeholder="НК −20%"
                />
              </div>
              <div className="sales-finance-block__field">
                <label htmlFor={`promo-start-${idx}`}>С</label>
                <input
                  id={`promo-start-${idx}`}
                  type="date"
                  className="sales-finance-block__input"
                  value={String(row.start_date ?? '')}
                  disabled={!canEdit}
                  onChange={(e) => updateAt(idx, { start_date: e.target.value })}
                />
              </div>
              <div className="sales-finance-block__field">
                <label htmlFor={`promo-end-${idx}`}>По</label>
                <input
                  id={`promo-end-${idx}`}
                  type="date"
                  className="sales-finance-block__input"
                  value={String(row.end_date ?? '')}
                  disabled={!canEdit}
                  onChange={(e) => updateAt(idx, { end_date: e.target.value })}
                />
              </div>
              <div className="sales-finance-block__field">
                <label htmlFor={`promo-seg-${idx}`}>Сегмент</label>
                <select
                  id={`promo-seg-${idx}`}
                  className="sales-finance-block__input"
                  value={String(row.segment_key ?? 'pz_nk')}
                  disabled={!canEdit}
                  onChange={(e) => updateAt(idx, { segment_key: e.target.value })}
                >
                  {SALES_PROMO_SEGMENT_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {salesPromoSegmentLabel(key)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sales-finance-block__field">
                <label htmlFor={`promo-goal-${idx}`}>Цель, шт</label>
                <input
                  id={`promo-goal-${idx}`}
                  type="text"
                  inputMode="numeric"
                  className="sales-finance-block__input"
                  value={row.goal_qty === 0 || row.goal_qty == null ? '' : String(row.goal_qty)}
                  disabled={!canEdit}
                  onChange={(e) =>
                    updateAt(idx, { goal_qty: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
                  }
                  placeholder="0"
                />
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="btn-icon-square sales-promotions__remove"
                  title="Удалить акцию"
                  aria-label="Удалить акцию"
                  onClick={() => removeAt(idx)}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <button type="button" className="btn btn-secondary sales-promotions__add" onClick={addRow}>
          <Plus size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          Добавить акцию
        </button>
      ) : null}
    </SalesFinanceBlock>
  )
}
