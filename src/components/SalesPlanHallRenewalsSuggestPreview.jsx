import { Check } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import {
  HALL_RENEWALS_HALLS,
  formatHallRenewalsSummaryRu,
} from '../lib/admin/salesPlanHallRenewalsSuggestCore.js'
import { formatHallPlanTopUpSummaryRu } from '../lib/admin/salesPlanHallTopUpCore.js'
import { pzDkSuggestHorizonLabelRu } from '../lib/admin/salesPlanPzDkSuggestCore.js'
import { SalesStrategyPackageBoard } from './SalesStrategyPackageBoard.jsx'
import { SalesStrategyNkUkEditTable } from './SalesStrategyNkUkEditTable.jsx'

/**
 * @param {{
 *   suggest: object,
 *   topUpPack?: object | null,
 *   disabled?: boolean,
 *   onApply: () => void,
 *   onNkUkChange?: (hall: 'pz'|'tz'|'az', category: 'nk'|'uk', field: 'count'|'avg_check', value: string) => void,
 * }} props
 */
export function SalesPlanHallRenewalsSuggestPreview({
  suggest,
  topUpPack = null,
  disabled = false,
  onApply,
  onNkUkChange,
}) {
  if (!suggest?.ok) return null

  const horizonLabel = pzDkSuggestHorizonLabelRu(suggest.horizon)
  const renewalPct = Number(suggest.renewalPct) || 0
  const depth = Number(suggest.historyDepth) || 3
  const miss = Math.trunc(Number(suggest.endingWithoutPrice) || 0)
  const alreadyBought = Math.trunc(Number(suggest.endingAlreadyPurchased) || 0)
  const packOk = Boolean(topUpPack?.ok)
  const applyAmount = packOk
    ? Number(topUpPack.totalWithExtra) || Number(topUpPack.totalAmount) || 0
    : suggest.amount
  const applyExtra = packOk ? Number(topUpPack.planExtraRub) || 0 : 0
  const applyCount = packOk
    ? Object.values(topUpPack.cells ?? {}).reduce((a, c) => a + (Number(c.count) || 0), 0)
    : suggest.count

  return (
    <div className="sales-plan-pz-dk-preview" role="status" aria-label="Превью продлений и добора плана">
      <header className="sales-plan-pz-dk-preview__head">
        <div className="sales-plan-pz-dk-preview__head-text">
          <p className="sales-plan-pz-dk-preview__eyebrow">1. Продления ДК</p>
          <h3 className="sales-plan-pz-dk-preview__title">ПЗ · ТЗ · АЗ · ДК</h3>
        </div>
        <span className="sales-plan-pz-dk-preview__badge">{horizonLabel}</span>
      </header>

      <div className="sales-plan-pz-dk-preview__meta muted">
        <span>История до {depth} покупок, иначе прайс</span>
        <span>{renewalPct}% продления</span>
        {Number(suggest.fromHistory) > 0 ? (
          <span>Из истории: {suggest.fromHistory}</span>
        ) : null}
        {Number(suggest.fromPriceList) > 0 ? (
          <span>Из прайса: {suggest.fromPriceList}</span>
        ) : null}
        {miss > 0 ? <span>Без цены: {miss}</span> : null}
        {alreadyBought > 0 ? <span>Уже купили след.: {alreadyBought}</span> : null}
      </div>

      <div className="sales-plan-pz-dk-preview__table-wrap">
        <table className="sales-plan-pz-dk-preview__table">
          <thead>
            <tr>
              <th scope="col">Зал</th>
              <th scope="col" className="sales-plan-pz-dk-preview__num">
                База
              </th>
              <th scope="col" className="sales-plan-pz-dk-preview__num">
                ДК в план
              </th>
              <th scope="col" className="sales-plan-pz-dk-preview__num">
                Ср. чек
              </th>
              <th scope="col" className="sales-plan-pz-dk-preview__num">
                Сумма
              </th>
            </tr>
          </thead>
          <tbody>
            {HALL_RENEWALS_HALLS.map((def) => {
              const cell = suggest.byHall?.[def.hall]
              if (!cell) return null
              return (
                <tr key={def.hall}>
                  <th scope="row" className="sales-plan-pz-dk-preview__code">
                    {def.label}
                  </th>
                  <td className="sales-plan-pz-dk-preview__num">{cell.rawCount}</td>
                  <td className="sales-plan-pz-dk-preview__num">
                    <strong>{cell.count}</strong>
                  </td>
                  <td className="sales-plan-pz-dk-preview__num">{formatRub(cell.avg_check)}</td>
                  <td className="sales-plan-pz-dk-preview__num">{formatRub(cell.amount)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Итого ДК</th>
              <td className="sales-plan-pz-dk-preview__num" />
              <td className="sales-plan-pz-dk-preview__num">
                <strong>{suggest.count}</strong>
              </td>
              <td className="sales-plan-pz-dk-preview__num">{formatRub(suggest.avg_check)}</td>
              <td className="sales-plan-pz-dk-preview__num">
                <strong>{formatRub(suggest.amount)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="muted" style={{ margin: '0.5rem 0 0' }}>
        {formatHallRenewalsSummaryRu(suggest)}
      </p>

      {packOk ? (
        <>
          <header className="sales-plan-pz-dk-preview__head" style={{ marginTop: '1.1rem' }}>
            <div className="sales-plan-pz-dk-preview__head-text">
              <p className="sales-plan-pz-dk-preview__eyebrow">2. НК / УК + добор до плана</p>
              <h3 className="sales-plan-pz-dk-preview__title">Пакет месяца</h3>
            </div>
          </header>
          <SalesStrategyPackageBoard renewalsSuggest={suggest} topUpPack={topUpPack} />
          <p className="muted sales-plan-pz-dk-suggest__lead" style={{ marginTop: '0.65rem' }}>
            Доп. = {topUpPack.planExtraPct || 70}% прошлого месяца; добор НК/УК — по доле выручки
            зала за прошлый месяц (не по штукам). Допуск сверху +
            {formatRub(topUpPack.budgetTolerance || 15000)}.
          </p>
          {topUpPack.fittedToBudget === false ? (
            <p className="sync-feedback sync-feedback--err" role="alert">
              {topUpPack.targets?.fitted === false
                ? 'Сумма ДК продлений больше бюджета залов (ур. 3 − доп.) — не уместились.'
                : (Number(topUpPack.budgetDelta) || 0) < 0
                  ? 'Пакет залов ниже (ур. 3 − доп.) — поправьте НК/УК или пересчитайте.'
                  : 'Пакет залов выше цели больше допуска +15 000 ₽.'}
            </p>
          ) : null}
          {typeof onNkUkChange === 'function' ? (
            <SalesStrategyNkUkEditTable
              topUpPack={topUpPack}
              disabled={disabled}
              onNkUkChange={onNkUkChange}
            />
          ) : (
            <div className="sales-plan-pz-dk-preview__table-wrap">
              <table className="sales-plan-pz-dk-preview__table">
                <thead>
                  <tr>
                    <th scope="col">Зал</th>
                    <th scope="col" className="sales-plan-pz-dk-preview__num">
                      НК
                    </th>
                    <th scope="col" className="sales-plan-pz-dk-preview__num">
                      ДК
                    </th>
                    <th scope="col" className="sales-plan-pz-dk-preview__num">
                      УК
                    </th>
                    <th scope="col" className="sales-plan-pz-dk-preview__num">
                      Итого
                    </th>
                    <th scope="col" className="sales-plan-pz-dk-preview__num">
                      Цель
                    </th>
                    <th scope="col" className="sales-plan-pz-dk-preview__num">
                      Добор
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {HALL_RENEWALS_HALLS.map((def) => {
                    const row = topUpPack.byHall?.[def.hall]
                    if (!row) return null
                    return (
                      <tr key={def.hall}>
                        <th scope="row" className="sales-plan-pz-dk-preview__code">
                          {def.label}
                        </th>
                        <td className="sales-plan-pz-dk-preview__num">{formatRub(row.nk)}</td>
                        <td className="sales-plan-pz-dk-preview__num">{formatRub(row.dk)}</td>
                        <td className="sales-plan-pz-dk-preview__num">{formatRub(row.uk)}</td>
                        <td className="sales-plan-pz-dk-preview__num">
                          <strong>{formatRub(row.total)}</strong>
                        </td>
                        <td className="sales-plan-pz-dk-preview__num">
                          {row.planTarget > 0 ? formatRub(row.planTarget) : '—'}
                        </td>
                        <td className="sales-plan-pz-dk-preview__num">
                          {row.topUp > 0 ? formatRub(row.topUp) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Итого</th>
                    <td className="sales-plan-pz-dk-preview__num" colSpan={3} />
                    <td className="sales-plan-pz-dk-preview__num">
                      <strong>{formatRub(topUpPack.totalAmount)}</strong>
                    </td>
                    <td className="sales-plan-pz-dk-preview__num" />
                    <td className="sales-plan-pz-dk-preview__num">
                      {topUpPack.totalTopUp > 0 ? formatRub(topUpPack.totalTopUp) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            {formatHallPlanTopUpSummaryRu(topUpPack)}
          </p>
        </>
      ) : null}

      <div className="sales-plan-pz-dk-preview__foot">
        <button type="button" className="btn btn-primary" onClick={onApply} disabled={disabled}>
          <Check size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          {packOk
            ? `В план клуба · ${Math.round(applyCount)} шт. · ${formatRub(applyAmount)}${
                applyExtra > 0 ? ` (залы + доп.)` : ''
              }`
            : `В план · ДК ${suggest.count} шт. · ${formatRub(suggest.amount)}`}
        </button>
        <p className="sales-plan-pz-dk-preview__foot-hint muted">
          {packOk
            ? 'Заполнит матрицу НК/ДК/УК, направления залов и доп. продажи. Затем сохраните во вкладке «План месяца».'
            : 'Заполнит только ДК (полного пакета нет — мало данных прошлого месяца).'}
        </p>
      </div>
    </div>
  )
}
