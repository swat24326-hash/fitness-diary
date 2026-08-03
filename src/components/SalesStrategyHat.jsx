import { Compass, RefreshCw } from 'lucide-react'
import { SalesStrategyPlanBrief } from './SalesStrategyPlanBrief.jsx'

/**
 * Шапка вкладки Стратегия: месяц, ур. 3, параметры и «Посчитать».
 *
 * @param {{
 *   busy?: boolean,
 *   canRefresh?: boolean,
 *   onRefresh?: () => void,
 *   horizon: 'current' | 'next',
 *   onHorizon: (h: 'current' | 'next') => void,
 *   monthLabel?: string,
 *   planLevel3?: number|null,
 *   prevMonthLabel?: string,
 *   controls?: import('react').ReactNode,
 * }} props
 */
export function SalesStrategyHat({
  busy = false,
  canRefresh = false,
  onRefresh,
  horizon,
  onHorizon,
  monthLabel = '',
  planLevel3 = null,
  prevMonthLabel = '',
  controls = null,
}) {
  return (
    <header className="sales-strategy__hat">
      <div className="sales-strategy__hat-brand">
        <div className="sales-strategy__hat-brand-row">
          <h2 className="sales-strategy__title" id="sales-strategy-title">
            <Compass size={20} aria-hidden className="sales-strategy__hat-icon" />
            Стратегия
          </h2>
          <button
            type="button"
            className="btn btn-icon-square"
            onClick={() => onRefresh?.()}
            disabled={busy || !canRefresh}
            aria-label="Обновить"
            title="Обновить"
          >
            <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
          </button>
        </div>
        <p className="muted sales-strategy__hat-lead">
          Закрытия ДК → пакет до ур. 3 → playbook. «В план» → вкладка «План месяца».
        </p>
      </div>

      <div className="sales-strategy__hat-month" role="group" aria-label="Месяц плана">
        <button
          type="button"
          className={`sales-strategy__chip${horizon === 'current' ? ' is-active' : ''}`}
          onClick={() => onHorizon('current')}
          disabled={busy}
        >
          Текущий
        </button>
        <button
          type="button"
          className={`sales-strategy__chip${horizon === 'next' ? ' is-active' : ''}`}
          onClick={() => onHorizon('next')}
          disabled={busy}
        >
          Следующий
        </button>
      </div>

      <SalesStrategyPlanBrief
        compact
        monthLabel={monthLabel}
        planLevel3={planLevel3}
        prevMonthLabel={prevMonthLabel}
      />

      {controls ? <div className="sales-strategy__hat-controls">{controls}</div> : null}
    </header>
  )
}
