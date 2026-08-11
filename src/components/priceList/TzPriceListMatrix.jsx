import { Plus, Trash2 } from 'lucide-react'
import {
  formatTzMonthsLabel,
  formatTzSessionsLabel,
} from '../../lib/priceList/tzPriceListCore.js'
import { formatPriceListMoney } from '../../lib/priceList/priceListExportCore.js'

/**
 * Матрица прайса ТЗ: «1 месяц» или «Акции» + правки оси и строк.
 *
 * @param {{
 *   view: 'month1' | 'promo',
 *   doc: object,
 *   onMonth1Field: (id: string, field: string, value: string) => void,
 *   onPromoField: (id: string, field: string, value: string) => void,
 *   onAxis: (kind: 'month1' | 'promo', id: string, patch: object) => void,
 *   onAddRow: () => void,
 *   onRemoveRow: (id: string) => void,
 * }} props
 */
export function TzPriceListMatrix({
  view,
  doc,
  onMonth1Field,
  onPromoField,
  onAxis,
  onAddRow,
  onRemoveRow,
}) {
  if (view === 'month1') {
    return (
      <div className="price-list__matrix">
        <div className="tz-price-list__struct" role="toolbar" aria-label="Строки 1 месяц">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAddRow}>
            <Plus size={16} aria-hidden />
            Строка
          </button>
        </div>
        <div className="price-list__scroll">
          <table className="price-list__table tz-price-list__table">
            <thead>
              <tr>
                <th scope="col" className="price-list__sticky price-list__axis price-list__axis--head">
                  Срок
                </th>
                <th scope="col" className="price-list__sticky price-list__sticky--2 price-list__axis">
                  Тренировки
                </th>
                <th scope="col">База полная</th>
                <th scope="col" className="tz-price-list__col-stand">
                  База стенд
                </th>
                <th scope="col">Экон.</th>
                <th scope="col" className="tz-price-list__col-day">
                  День стенд
                </th>
                <th scope="col">Экон.</th>
                <th scope="col" className="tz-price-list__col-act">
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(doc.month1_rows ?? []).map((r, idx) => (
                <tr key={r.id} className={idx % 2 ? 'tz-price-list__row--band' : undefined}>
                  <th scope="row" className="price-list__sticky price-list__axis">
                    <input
                      type="number"
                      inputMode="numeric"
                      className="price-list__input tz-price-list__axis-input"
                      min={1}
                      step={1}
                      value={r.months ?? 1}
                      onChange={(e) => onAxis('month1', r.id, { months: e.target.value })}
                      aria-label={`Срок, мес: ${formatTzMonthsLabel(r.months)}`}
                      title="Срок в месяцах"
                    />
                  </th>
                  <td className="price-list__sticky price-list__sticky--2 price-list__axis">
                    <input
                      type="text"
                      className="price-list__input tz-price-list__axis-input tz-price-list__axis-input--sessions"
                      value={r.sessions == null ? 'без лимита' : String(r.sessions)}
                      placeholder="без лимита"
                      onChange={(e) => {
                        const t = e.target.value.trim()
                        onAxis('month1', r.id, {
                          sessions: t === '' || /без/i.test(t) ? null : t,
                        })
                      }}
                      aria-label={`Тренировки: ${formatTzSessionsLabel(r.sessions)}`}
                      title="Число занятий или «без лимита»"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="price-list__input"
                      value={r.base_full ?? ''}
                      onChange={(e) => onMonth1Field(r.id, 'base_full', e.target.value)}
                      aria-label="База полная"
                    />
                  </td>
                  <td className="tz-price-list__col-stand">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="price-list__input price-list__input--discount"
                      value={r.base_stand ?? ''}
                      onChange={(e) => onMonth1Field(r.id, 'base_stand', e.target.value)}
                      aria-label="База стенд"
                    />
                  </td>
                  <td className="tz-price-list__computed">{formatPriceListMoney(r.base_save)}</td>
                  <td className="tz-price-list__col-day">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="price-list__input price-list__input--discount"
                      value={r.day_stand ?? ''}
                      onChange={(e) => onMonth1Field(r.id, 'day_stand', e.target.value)}
                      aria-label="День стенд"
                    />
                  </td>
                  <td className="tz-price-list__computed">{formatPriceListMoney(r.day_save)}</td>
                  <td className="tz-price-list__col-act">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-icon-square"
                      onClick={() => onRemoveRow(r.id)}
                      aria-label="Удалить строку"
                      title="Удалить строку"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="price-list__scroll-hint muted">Колонка «стенд» — цена на витрине</p>
      </div>
    )
  }

  return (
    <div className="price-list__matrix">
      <div className="tz-price-list__struct" role="toolbar" aria-label="Строки акций">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAddRow}>
          <Plus size={16} aria-hidden />
          Строка
        </button>
      </div>
      <div className="price-list__scroll">
        <table className="price-list__table tz-price-list__table">
          <thead>
            <tr>
              <th scope="col" className="price-list__sticky price-list__axis price-list__axis--head">
                Срок
              </th>
              <th scope="col" className="price-list__sticky price-list__sticky--2 price-list__axis">
                Тренировки
              </th>
              <th scope="col">База</th>
              <th scope="col" className="tz-price-list__col-stand">
                Акция
              </th>
              <th scope="col">Экономия</th>
              <th scope="col">₽ / мес</th>
              <th scope="col" className="tz-price-list__col-act">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(doc.promo_rows ?? []).map((r, idx) => (
              <tr key={r.id} className={idx % 2 ? 'tz-price-list__row--band' : undefined}>
                <th scope="row" className="price-list__sticky price-list__axis">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="price-list__input tz-price-list__axis-input"
                    min={1}
                    step={1}
                    value={r.months ?? 1}
                    onChange={(e) => onAxis('promo', r.id, { months: e.target.value })}
                    aria-label={`Срок акции: ${formatTzMonthsLabel(r.months)}`}
                  />
                </th>
                <td className="price-list__sticky price-list__sticky--2 price-list__axis">
                  <input
                    type="text"
                    className="price-list__input tz-price-list__axis-input tz-price-list__axis-input--sessions"
                    value={r.sessions == null ? 'без лимита' : String(r.sessions)}
                    placeholder="без лимита"
                    onChange={(e) => {
                      const t = e.target.value.trim()
                      onAxis('promo', r.id, {
                        sessions: t === '' || /без/i.test(t) ? null : t,
                      })
                    }}
                    aria-label={`Тренировки: ${formatTzSessionsLabel(r.sessions)}`}
                    title="Число занятий или «без лимита»"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="price-list__input"
                    value={r.base_full ?? ''}
                    onChange={(e) => onPromoField(r.id, 'base_full', e.target.value)}
                    aria-label="База"
                  />
                </td>
                <td className="tz-price-list__col-stand">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="price-list__input price-list__input--discount"
                    value={r.promo ?? ''}
                    onChange={(e) => onPromoField(r.id, 'promo', e.target.value)}
                    aria-label="Акция"
                  />
                </td>
                <td className="tz-price-list__computed">{formatPriceListMoney(r.save)}</td>
                <td className="tz-price-list__computed">{formatPriceListMoney(r.month_cost)}</td>
                <td className="tz-price-list__col-act">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-icon-square"
                    onClick={() => onRemoveRow(r.id)}
                    aria-label="Удалить строку"
                    title="Удалить строку"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
