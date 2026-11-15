import { Compass } from 'lucide-react'
import { AdminClubStatsHelpTip } from './admin/AdminClubStatsHelpTip.jsx'
import { salesStrategyHelpLines } from '../lib/admin/salesStrategyHelpCore.js'
import { SalesStrategyPlanBrief } from './SalesStrategyPlanBrief.jsx'

/**
 * Шапка вкладки Стратегия: месяц, ур. 3, параметры и «Посчитать».
 *
 * @param {{
 *   busy?: boolean,
 *   horizon: 'current' | 'next',
 *   onHorizon: (h: 'current' | 'next') => void,
 *   monthLabel?: string,
 *   planLevel3?: number|null,
 *   prevMonthLabel?: string,
 *   controls?: import('react').ReactNode,
 *   helpPack?: { planExtraPct?: number, budgetTolerance?: number } | null,
 *   showTitle?: boolean,
 * }} props
 */
export function SalesStrategyHat({
  busy = false,
  horizon,
  onHorizon,
  monthLabel = '',
  planLevel3 = null,
  prevMonthLabel = '',
  controls = null,
  helpPack = null,
  showTitle = true,
}) {
  return (
    <header className={`sales-strategy__hat${showTitle ? '' : ' sales-strategy__hat--no-title'}`}>
      {showTitle ? (
        <div className="sales-strategy__hat-brand">
          <h2 className="sales-strategy__title" id="sales-strategy-title">
            <Compass size={20} aria-hidden className="sales-strategy__hat-icon" />
            Стратегия
          </h2>
        </div>
      ) : (
        <h2 className="sr-only" id="sales-strategy-title">
          Стратегия
        </h2>
      )}

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

      <div className="sales-strategy__hat-controls">
        {controls}
        <AdminClubStatsHelpTip
          className="sales-strategy__hat-help"
          label="Как устроена Стратегия"
          lines={salesStrategyHelpLines(helpPack)}
        />
      </div>
    </header>
  )
}
