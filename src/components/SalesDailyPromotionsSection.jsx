import { Tag } from 'lucide-react'
import {
  activePromotionsOnDate,
  salesPromoSegmentsLabel,
} from '../lib/admin/salesPromotionsCore.js'

/**
 * Счётчики продаж по активным акциям дня.
 * @param {{
 *   reportDate: string,
 *   promotions?: Array<Record<string, unknown>>,
 *   promoSales?: Record<string, string>,
 *   onPromoSalesChange?: (next: Record<string, string>) => void,
 *   canEdit?: boolean,
 * }} props
 */
export function SalesDailyPromotionsSection({
  reportDate,
  promotions = [],
  promoSales = {},
  onPromoSalesChange,
  canEdit = true,
}) {
  const active = activePromotionsOnDate(promotions, reportDate)
  if (!active.length) return null

  const setQty = (id, value) => {
    if (!onPromoSalesChange) return
    onPromoSalesChange({ ...promoSales, [id]: value })
  }

  return (
    <section className="sales-report__card sales-daily-promos" aria-labelledby="sales-daily-promos-title">
      <h3 className="sales-report__stats-block-title" id="sales-daily-promos-title">
        <Tag size={18} style={{ verticalAlign: -3, marginRight: 6 }} aria-hidden />
        Акции за день
      </h3>
      <p className="muted sales-daily-promos__hint">
        Сколько штук продано по акции (одна цифра на всю акцию). Не больше факта выбранных сегментов в
        матрице выше.
      </p>
      <ul className="sales-daily-promos__list">
        {active.map((p) => (
          <li key={p.id} className="sales-daily-promos__row">
            <div className="sales-daily-promos__meta">
              <span className="sales-daily-promos__name">{p.name}</span>
              <span className="muted sales-daily-promos__seg">
                {salesPromoSegmentsLabel(p.segment_keys ?? [p.segment_key])}
              </span>
            </div>
            <label className="sales-daily-promos__qty" htmlFor={`daily-promo-${p.id}`}>
              <span className="sr-only">Штук по акции {p.name}</span>
              <input
                id={`daily-promo-${p.id}`}
                type="text"
                inputMode="numeric"
                className="sales-finance-block__input"
                value={promoSales[p.id] ?? ''}
                disabled={!canEdit}
                onChange={(e) => setQty(p.id, e.target.value)}
                placeholder="0"
                aria-label={`${p.name}, штук`}
              />
              <span className="muted">шт</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
