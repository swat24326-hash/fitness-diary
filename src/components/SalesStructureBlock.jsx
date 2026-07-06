import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {{
 *   title: string,
 *   items: Array<{ key: string, label: string, amount: number, sharePercent: number, planProgressPercent?: number, planTarget?: number }>,
 *   showPlan?: boolean,
 * }} props
 */
export function SalesStructureBlock({ title, items, showPlan = false }) {
  return (
    <div className="sales-report__structure-group">
      <h4 className="sales-report__structure-subtitle">{title}</h4>
      <div className="sales-report__structure-list">
        {items.map((item) => (
          <div className="sales-report__structure-row" key={item.key}>
            <div
              className={`sales-report__structure-head${showPlan ? ' sales-report__structure-head--plan' : ''}`}
            >
              <span className="sales-report__structure-label">{item.label}</span>
              <span className="sales-report__structure-sum">{formatRub(item.amount)}</span>
              <span className="sales-report__structure-pct muted" title="Доля в выручке">
                {item.sharePercent}%
              </span>
              {showPlan ? (
                <span className="sales-report__structure-plan-pct muted" title="Выполнение плана">
                  {item.planTarget > 0 ? `план ${Math.round(item.planProgressPercent ?? 0)}%` : 'план —'}
                </span>
              ) : null}
            </div>
            <div className="sales-report__structure-track" aria-hidden>
              <div
                className={`sales-report__structure-fill sales-report__structure-fill--${item.key}`}
                style={{ width: `${Math.min(100, item.sharePercent)}%` }}
              />
            </div>
            {showPlan && item.planTarget > 0 ? (
              <div className="sales-report__structure-track sales-report__structure-track--plan" aria-hidden>
                <div
                  className={`sales-report__structure-fill sales-report__structure-fill--plan sales-report__structure-fill--${item.key}`}
                  style={{ width: `${Math.min(100, item.planProgressPercent ?? 0)}%` }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
