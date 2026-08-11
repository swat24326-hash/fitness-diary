import { Fragment } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { getAzPriceListCell } from '../../lib/priceList/azPriceListCore.js'
import { formatPriceListMoney } from '../../lib/priceList/priceListExportCore.js'

/**
 * Сетка направлений × сессии или доплаты АЗ.
 *
 * @param {{
 *   view: 'result' | 'classes' | 'fees',
 *   doc: object,
 *   onCell: (sessions: number, directionId: string, field: 'full' | 'off', raw: string) => void,
 *   onRenameDirection: (directionId: string, label: string) => void,
 *   onRemoveDirection: (directionId: string) => void,
 *   onAddDirection: () => void,
 *   onAddSession: () => void,
 *   onRemoveSession: (sessions: number) => void,
 *   onFeeChange: (id: string, patch: { name?: string, amount?: string }) => void,
 *   onAddFee: () => void,
 *   onRemoveFee: (id: string) => void,
 * }} props
 */
export function AzPriceListMatrix({
  view,
  doc,
  onCell,
  onRenameDirection,
  onRemoveDirection,
  onAddDirection,
  onAddSession,
  onRemoveSession,
  onFeeChange,
  onAddFee,
  onRemoveFee,
}) {
  if (view === 'fees') {
    return (
      <div className="az-price-list__fees">
        <div className="az-price-list__struct" role="toolbar" aria-label="Доплаты">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAddFee}>
            <Plus size={16} aria-hidden />
            Доплата
          </button>
        </div>
        {(doc.extras?.other_fees ?? []).length === 0 ? (
          <p className="muted">Нет прочих доплат — добавьте строку или загрузите Excel.</p>
        ) : (
          <table className="price-list__table az-price-list__fees-table">
            <thead>
              <tr>
                <th>Наименование</th>
                <th>Сумма</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(doc.extras.other_fees ?? []).map((f) => (
                <tr key={f.id}>
                  <td>
                    <input
                      type="text"
                      className="input price-list__cell-input"
                      value={f.name ?? ''}
                      onChange={(e) => onFeeChange(f.id, { name: e.target.value })}
                      aria-label="Наименование доплаты"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input price-list__cell-input"
                      min={0}
                      step={1}
                      value={f.amount ?? ''}
                      onChange={(e) => onFeeChange(f.id, { amount: e.target.value })}
                      aria-label={f.name || 'Сумма'}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-icon-square"
                      onClick={() => onRemoveFee(f.id)}
                      aria-label="Удалить доплату"
                      title="Удалить"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {doc.extras?.evening_pt_surcharge != null ? (
          <p className="az-price-list__fee-note muted">
            Доплата ПТ вечером (в подвале стенда):{' '}
            <strong>{formatPriceListMoney(doc.extras.evening_pt_surcharge)}</strong>
          </p>
        ) : null}
      </div>
    )
  }

  const directions = view === 'classes' ? doc.class_directions ?? [] : doc.result_directions ?? []
  const sessions = doc.session_counts ?? []

  if (directions.length === 0) {
    return (
      <div className="az-price-list__struct-empty">
        <p className="muted price-list__hint">Нет направлений — создайте сетку или загрузите Excel.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAddDirection}>
          <Plus size={16} aria-hidden />
          Направление
        </button>
      </div>
    )
  }

  return (
    <div className="price-list__matrix">
      <div className="az-price-list__struct" role="toolbar" aria-label="Структура сетки АЗ">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAddDirection}>
          <Plus size={16} aria-hidden />
          Направление
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAddSession}>
          <Plus size={16} aria-hidden />
          Кол-во занятий
        </button>
      </div>
      <div className="price-list__scroll">
        <table className="price-list__table az-price-list__table">
          <thead>
            <tr>
              <th rowSpan={2} className="price-list__sticky price-list__axis price-list__axis--head">
                Трен.
              </th>
              {directions.map((d) => (
                <th key={d.id} colSpan={2} className="price-list__tariff az-price-list__dir-head">
                  <div className="az-price-list__dir-row">
                    <input
                      type="text"
                      className="price-list__input az-price-list__dir-input"
                      value={d.label}
                      onChange={(e) => onRenameDirection(d.id, e.target.value)}
                      aria-label="Название направления"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-icon-square"
                      onClick={() => onRemoveDirection(d.id)}
                      aria-label={`Убрать ${d.label}`}
                      title="Убрать направление"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
            <tr className="price-list__subhead-row">
              {directions.map((d) => (
                <Fragment key={`${d.id}-sub`}>
                  <th scope="col" className="price-list__subhead">
                    Полная
                  </th>
                  <th
                    scope="col"
                    className="price-list__subhead price-list__subhead--discount az-price-list__col-stand"
                  >
                    −10%
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, ri) => (
              <tr key={s} className={ri % 2 ? 'az-price-list__row--band' : undefined}>
                <th className="price-list__sticky price-list__axis az-price-list__sess-cell">
                  <span>{s}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-icon-square"
                    onClick={() => onRemoveSession(s)}
                    aria-label={`Убрать ${s} занятий`}
                    title="Убрать строку занятий"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </th>
                {directions.map((d) => {
                  const cell = getAzPriceListCell(doc, { sessions: s, directionId: d.id })
                  return (
                    <Fragment key={`${s}-${d.id}`}>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          className="input price-list__cell-input"
                          min={0}
                          step={1}
                          value={cell.price_full ?? ''}
                          onChange={(e) => onCell(s, d.id, 'full', e.target.value)}
                          aria-label={`${d.label} полная, ${s} тр.`}
                        />
                      </td>
                      <td className="az-price-list__col-stand">
                        <input
                          type="number"
                          inputMode="numeric"
                          className="input price-list__cell-input"
                          min={0}
                          step={1}
                          value={cell.price_10 ?? ''}
                          onChange={(e) => onCell(s, d.id, 'off', e.target.value)}
                          aria-label={`${d.label} стенд, ${s} тр.`}
                        />
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="price-list__scroll-hint muted">Колонка стенда — цена −10% (автосвязь с полной)</p>
    </div>
  )
}
