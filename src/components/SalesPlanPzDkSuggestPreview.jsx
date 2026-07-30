import { Check } from 'lucide-react'
import { formatDateRu } from '../lib/dateRu.js'
import { formatRub } from '../lib/admin/salesReportCore.js'
import {
  pzDkSuggestHorizonLabelRu,
  PZ_DK_SUGGEST_SESSIONS,
} from '../lib/admin/salesPlanPzDkSuggestCore.js'

/**
 * Превью ориентира ПЗ ДК: KPI + таблица по картам + итог + CTA.
 *
 * @param {{
 *   suggest: object,
 *   disabled?: boolean,
 *   onApply: () => void,
 * }} props
 */
export function SalesPlanPzDkSuggestPreview({ suggest, disabled = false, onApply }) {
  if (!suggest?.ok) return null

  const rows = Array.isArray(suggest.byTypePlan) ? suggest.byTypePlan : []
  const horizonLabel = pzDkSuggestHorizonLabelRu(suggest.horizon)
  const asOf = String(suggest.asOfIso ?? '').slice(0, 10)
  const renewalPct = Number(suggest.renewalPct) || 0
  const rawCount = Math.trunc(Number(suggest.rawCount) || 0)
  const afterRate = Math.trunc(Number(suggest.afterRate) || 0)
  const fact = Math.trunc(Number(suggest.factPzDkCount) || 0)
  const sessions = Number(suggest.sessions) || PZ_DK_SUGGEST_SESSIONS

  return (
    <div className="sales-plan-pz-dk-preview" role="status" aria-label="Превью плана ПЗ ДК">
      <header className="sales-plan-pz-dk-preview__head">
        <div className="sales-plan-pz-dk-preview__head-text">
          <p className="sales-plan-pz-dk-preview__eyebrow">Ориентир продлений</p>
          <h3 className="sales-plan-pz-dk-preview__title">ПЗ · ДК</h3>
        </div>
        <span className="sales-plan-pz-dk-preview__badge">{horizonLabel}</span>
      </header>

      <div className="sales-plan-pz-dk-preview__kpis" aria-label="Сводка">
        <div className="sales-plan-pz-dk-preview__kpi">
          <span className="sales-plan-pz-dk-preview__kpi-label">База</span>
          <strong className="sales-plan-pz-dk-preview__kpi-value">{rawCount}</strong>
          <span className="sales-plan-pz-dk-preview__kpi-sub">действующих</span>
        </div>
        <div className="sales-plan-pz-dk-preview__kpi">
          <span className="sales-plan-pz-dk-preview__kpi-label">Продления</span>
          <strong className="sales-plan-pz-dk-preview__kpi-value">
            {afterRate}
            <span className="sales-plan-pz-dk-preview__kpi-pct"> · {renewalPct}%</span>
          </strong>
          <span className="sales-plan-pz-dk-preview__kpi-sub">после %</span>
        </div>
        {fact > 0 ? (
          <div className="sales-plan-pz-dk-preview__kpi sales-plan-pz-dk-preview__kpi--muted">
            <span className="sales-plan-pz-dk-preview__kpi-label">Уже в факте</span>
            <strong className="sales-plan-pz-dk-preview__kpi-value">−{fact}</strong>
            <span className="sales-plan-pz-dk-preview__kpi-sub">шт. ПЗ ДК</span>
          </div>
        ) : null}
        <div className="sales-plan-pz-dk-preview__kpi sales-plan-pz-dk-preview__kpi--accent">
          <span className="sales-plan-pz-dk-preview__kpi-label">В план</span>
          <strong className="sales-plan-pz-dk-preview__kpi-value">{suggest.count}</strong>
          <span className="sales-plan-pz-dk-preview__kpi-sub">{formatRub(suggest.amount)}</span>
        </div>
      </div>

      <div className="sales-plan-pz-dk-preview__meta muted">
        <span>Пакет {sessions} тр. · 1 чел. · стенд −10%</span>
        {asOf ? <span>Срез {formatDateRu(asOf)}</span> : null}
        <span>Ср. чек {formatRub(suggest.avg_check)}</span>
      </div>

      {rows.length ? (
        <div className="sales-plan-pz-dk-preview__table-wrap">
          <table className="sales-plan-pz-dk-preview__table">
            <thead>
              <tr>
                <th scope="col">Карта</th>
                <th scope="col" className="sales-plan-pz-dk-preview__num">
                  База
                </th>
                <th scope="col" className="sales-plan-pz-dk-preview__num">
                  Продл.
                </th>
                <th scope="col" className="sales-plan-pz-dk-preview__num">
                  Чек
                </th>
                <th scope="col" className="sales-plan-pz-dk-preview__num">
                  Сумма
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.membershipTypeId || row.code}>
                  <th scope="row" className="sales-plan-pz-dk-preview__code">
                    {row.code}
                  </th>
                  <td className="sales-plan-pz-dk-preview__num">{row.baseCount}</td>
                  <td className="sales-plan-pz-dk-preview__num">
                    <strong>{row.planCount}</strong>
                  </td>
                  <td className="sales-plan-pz-dk-preview__num">{formatRub(row.priceRub)}</td>
                  <td className="sales-plan-pz-dk-preview__num">{formatRub(row.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Итого</th>
                <td className="sales-plan-pz-dk-preview__num">{rawCount}</td>
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
      ) : null}

      <div className="sales-plan-pz-dk-preview__foot">
        <button type="button" className="btn btn-primary" onClick={onApply} disabled={disabled}>
          <Check size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          В план · {suggest.count} шт. · {formatRub(suggest.amount)}
        </button>
        <p className="sales-plan-pz-dk-preview__foot-hint muted">
          Заполнит только ячейку ПЗ·ДК. Потом — «Сохранить направления».
        </p>
      </div>
    </div>
  )
}
