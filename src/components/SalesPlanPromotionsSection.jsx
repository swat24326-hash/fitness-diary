import { Plus, Save, Trash2 } from 'lucide-react'
import { SalesFinanceBlock } from './SalesFinanceBlock.jsx'
import {
  SALES_PROMO_COL_OPTIONS,
  SALES_PROMO_HALL_OPTIONS,
  buildPromoSegmentKeysFromAxes,
  emptySalesPromotionDraft,
  promoAxesFromSegmentKeys,
  resolvePromoSegmentKeysFromDraft,
} from '../lib/admin/salesPromotionsCore.js'

/**
 * CRUD акций в плане месяца.
 * Направления + НК/ДК/УК → одна акция с общей целью (без разбиения по сегментам).
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

  const setAxesAt = (idx, hallKeys, colSuffixes) => {
    const halls = hallKeys.length ? hallKeys : ['pz']
    const cols = colSuffixes.length ? colSuffixes : ['nk']
    const segment_keys = buildPromoSegmentKeysFromAxes(halls, cols)
    const keys = segment_keys.length ? segment_keys : ['pz_nk']
    updateAt(idx, {
      segment_keys: keys,
      segment_key: keys[0],
    })
  }

  const toggleHallAt = (idx, hallKey) => {
    const axes = promoAxesFromSegmentKeys(resolvePromoSegmentKeysFromDraft(list[idx]))
    const has = axes.hallKeys.includes(hallKey)
    const nextHalls = has
      ? axes.hallKeys.filter((h) => h !== hallKey)
      : [...axes.hallKeys, hallKey]
    if (!nextHalls.length) return
    setAxesAt(idx, nextHalls, axes.colSuffixes.length ? axes.colSuffixes : ['nk'])
  }

  const toggleColAt = (idx, colSuffix) => {
    const axes = promoAxesFromSegmentKeys(resolvePromoSegmentKeysFromDraft(list[idx]))
    const has = axes.colSuffixes.includes(colSuffix)
    const nextCols = has
      ? axes.colSuffixes.filter((c) => c !== colSuffix)
      : [...axes.colSuffixes, colSuffix]
    if (!nextCols.length) return
    setAxesAt(idx, axes.hallKeys.length ? axes.hallKeys : ['pz'], nextCols)
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
      hint="Сроки и одна общая цель в штуках. Выберите направления (ПЗ/ТЗ/АЗ/доп.) и НК/ДК/УК — продано считается по всей акции, без разбиения. Не входят в матрицу направлений и ур. 3."
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
          {list.map((row, idx) => {
            const axes = promoAxesFromSegmentKeys(resolvePromoSegmentKeysFromDraft(row))
            return (
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
                <div className="sales-finance-block__field sales-promotions__field--seg">
                  <span className="sales-promotions__seg-label" id={`promo-hall-label-${idx}`}>
                    Направления
                  </span>
                  <div
                    className="sales-promotions__seg-multi"
                    role="group"
                    aria-labelledby={`promo-hall-label-${idx}`}
                  >
                    {SALES_PROMO_HALL_OPTIONS.map((hall) => {
                      const on = axes.hallKeys.includes(hall.key)
                      return (
                        <button
                          key={hall.key}
                          type="button"
                          className={`sales-promotions__seg-chip${on ? ' is-on' : ''}`}
                          disabled={!canEdit}
                          aria-pressed={on}
                          onClick={() => toggleHallAt(idx, hall.key)}
                        >
                          {hall.label}
                        </button>
                      )
                    })}
                  </div>
                  <span className="sales-promotions__seg-label" id={`promo-col-label-${idx}`}>
                    НК / ДК / УК
                  </span>
                  <div
                    className="sales-promotions__seg-multi"
                    role="group"
                    aria-labelledby={`promo-col-label-${idx}`}
                  >
                    {SALES_PROMO_COL_OPTIONS.map((col) => {
                      const on = axes.colSuffixes.includes(col.suffix)
                      return (
                        <button
                          key={col.suffix}
                          type="button"
                          className={`sales-promotions__seg-chip${on ? ' is-on' : ''}`}
                          disabled={!canEdit}
                          aria-pressed={on}
                          onClick={() => toggleColAt(idx, col.suffix)}
                        >
                          {col.label}
                        </button>
                      )
                    })}
                  </div>
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
            )
          })}
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
