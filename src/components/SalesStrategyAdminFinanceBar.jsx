import { Wallet } from 'lucide-react'
import {
  buildStrategyAdminFinanceBar,
  formatStrategyAdminFinanceValue,
} from '../lib/admin/salesStrategyAdminFinanceCore.js'

/**
 * Админ-полоса Стратегии: нагрузка и чистая. Менеджеру не показывается.
 *
 * @param {{
 *   showAdminFinanceBar?: boolean,
 *   horizon?: 'current' | 'next',
 *   targetYear?: number,
 *   targetMonth?: number,
 *   baseYear?: number,
 *   baseMonth?: number,
 *   planMonthDays?: object[],
 *   prevMonthDays?: object[],
 *   membershipTypes?: object[],
 *   planForm?: Record<string, string>,
 *   expense?: number,
 * }} props
 */
export function SalesStrategyAdminFinanceBar(props) {
  const model = buildStrategyAdminFinanceBar(props)
  if (!model.visible) return null

  if (!model.ok) {
    return (
      <section className="sales-strategy-admin-finance sales-strategy-admin-finance--hint" aria-label="Нагрузка и прибыль">
        <p className="sales-strategy-admin-finance__hint muted" role="status">
          {model.hint}
        </p>
      </section>
    )
  }

  return (
    <section className="sales-strategy-admin-finance" aria-labelledby="sales-strategy-admin-finance-title">
      <header className="sales-strategy-admin-finance__head">
        <h3 className="sales-strategy-admin-finance__title" id="sales-strategy-admin-finance-title">
          <Wallet size={18} aria-hidden className="sales-strategy-admin-finance__title-icon" />
          {model.title}
        </h3>
        <p className="sales-strategy-admin-finance__subtitle muted">{model.subtitle}</p>
        {!model.closedMonth && !model.refundsPaced ? (
          <p className="sales-strategy-admin-finance__note muted">
            Возвраты в прогнозе = факт (мало дней с возвратом) — чистая может быть оптимистичнее.
          </p>
        ) : null}
      </header>
      <div className="sales-strategy-admin-finance__grid" role="list">
        {model.cells.map((cell) => {
          const factText = formatStrategyAdminFinanceValue(cell.kind, cell.fact, {
            signed: cell.signed,
          })
          const forecastText =
            cell.forecast == null
              ? null
              : formatStrategyAdminFinanceValue(cell.kind, cell.forecast, { signed: cell.signed })
          const negative =
            cell.signed &&
            ((cell.forecast != null ? Number(cell.forecast) : Number(cell.fact)) < 0)
          return (
            <article
              key={cell.key}
              className={[
                'sales-strategy-admin-finance__cell',
                cell.primary ? 'sales-strategy-admin-finance__cell--primary' : '',
                negative ? 'sales-strategy-admin-finance__cell--negative' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="listitem"
            >
              <span className="sales-strategy-admin-finance__label">{cell.label}</span>
              <strong className="sales-strategy-admin-finance__value">
                {forecastText ?? factText}
              </strong>
              {forecastText != null ? (
                <span className="sales-strategy-admin-finance__fact muted">факт {factText}</span>
              ) : (
                <span className="sales-strategy-admin-finance__fact muted">факт месяца</span>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
