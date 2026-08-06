import { Plus, Save, Trash2 } from 'lucide-react'
import { SalesFinanceBlock } from './SalesFinanceBlock.jsx'
import {
  SALES_PROMO_SEGMENT_KEYS,
  emptySalesPromotionDraft,
  resolvePromoSegmentKeysFromDraft,
  salesPromoSegmentLabel,
} from '../lib/admin/salesPromotionsCore.js'

/**
 * CRUD акций в плане месяца.
 * Несколько сегментов в строке → при сохранении отдельные акции (одна цель на каждый).
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

  const setSegmentsAt = (idx, keys) => {
    const uniq = []
    for (const k of keys) {
      const s = String(k ?? '').trim()
      if (s && !uniq.includes(s)) uniq.push(s)
    }
    const nextKeys = uniq.length ? uniq : ['pz_nk']
    updateAt(idx, {
      segment_keys: nextKeys,
      segment_key: nextKeys[0],
    })
  }

  const toggleSegmentAt = (idx, key) => {
    const row = list[idx]
    const cur = resolvePromoSegmentKeysFromDraft(row)
    const has = cur.includes(key)
    if (has) {
      if (cur.length <= 1) return
      setSegmentsAt(
        idx,
        cur.filter((k) => k !== key),
      )
      return
    }
    setSegmentsAt(idx, [...cur, key])
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
      hint="Сроки и цель в штуках. Несколько сегментов — при сохранении отдельная акция на каждый (цель копируется). Не входят в матрицу направлений и ур. 3."
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
            const selected = resolvePromoSegmentKeysFromDraft(row)
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
                  <span className="sales-promotions__seg-label" id={`promo-seg-label-${idx}`}>
                    Сегменты
                  </span>
                  <div
                    className="sales-promotions__seg-multi"
                    role="group"
                    aria-labelledby={`promo-seg-label-${idx}`}
                  >
                    {SALES_PROMO_SEGMENT_KEYS.map((key) => {
                      const on = selected.includes(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`sales-promotions__seg-chip${on ? ' is-on' : ''}`}
                          disabled={!canEdit}
                          aria-pressed={on}
                          onClick={() => toggleSegmentAt(idx, key)}
                        >
                          {salesPromoSegmentLabel(key)}
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
