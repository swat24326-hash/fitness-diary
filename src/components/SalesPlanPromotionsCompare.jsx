import { Tag } from 'lucide-react'
import { buildPromotionsComparison } from '../lib/admin/salesPromotionsCore.js'
import { todayLocalIso } from '../lib/dateRu.js'

/**
 * Сводка акций: заложено / продано (рядом с таблицей сегментов).
 * @param {{
 *   promotions?: unknown,
 *   monthRows?: Array<Record<string, unknown>>,
 * }} props
 */
export function SalesPlanPromotionsCompare({ promotions, monthRows = [] }) {
  const comparison = buildPromotionsComparison({
    promotions,
    monthRows,
    todayIso: todayLocalIso(),
  })
  if (!comparison.has_promotions || !comparison.rows.length) return null

  return (
    <div className="sales-report__card sales-report__stats-block sales-promotions-compare">
      <h3 className="sales-report__stats-block-title">
        <Tag size={18} style={{ verticalAlign: -3, marginRight: 6 }} aria-hidden />
        Акции: заложено / продано
      </h3>
      <div className="sales-report__stats-table-wrap">
        <table className="sales-report__stats-table sales-promotions-compare__table">
          <thead>
            <tr>
              <th scope="col">Акция</th>
              <th scope="col">Сегмент</th>
              <th scope="col">Срок</th>
              <th scope="col">Заложено</th>
              <th scope="col">Продано</th>
              <th scope="col">Осталось</th>
              <th scope="col">%</th>
              <th scope="col">Статус</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.segment_label}</td>
                <td className="muted">
                  {row.start_date.slice(8, 10)}.{row.start_date.slice(5, 7)}–
                  {row.end_date.slice(8, 10)}.{row.end_date.slice(5, 7)}
                </td>
                <td>{row.goal_qty}</td>
                <td>
                  <strong>{row.sold_qty}</strong>
                </td>
                <td>{row.remaining_qty}</td>
                <td>{row.pct_of_goal == null ? '—' : `${row.pct_of_goal}%`}</td>
                <td>
                  <span
                    className={
                      row.active_now
                        ? 'sales-promotions-compare__badge sales-promotions-compare__badge--on'
                        : 'sales-promotions-compare__badge'
                    }
                  >
                    {row.active_now ? 'Сейчас' : 'Вне срока'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
