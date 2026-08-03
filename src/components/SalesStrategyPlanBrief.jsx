import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * Месяц и ур. 3 — бюджет пакета.
 *
 * @param {{
 *   monthLabel: string,
 *   planLevel3?: number|null,
 *   prevMonthLabel?: string,
 *   compact?: boolean,
 * }} props
 */
export function SalesStrategyPlanBrief({
  monthLabel,
  planLevel3 = null,
  prevMonthLabel = '',
  compact = false,
}) {
  return (
    <div
      className={`sales-strategy__brief${compact ? ' sales-strategy__brief--compact' : ''}`}
      role="status"
    >
      <div className="sales-strategy__brief-main">
        <span className="sales-strategy__brief-label">Месяц плана</span>
        <strong className="sales-strategy__brief-value">{monthLabel || '—'}</strong>
      </div>
      <div className="sales-strategy__brief-main sales-strategy__brief-main--accent">
        <span className="sales-strategy__brief-label">Уровень 3</span>
        <strong className="sales-strategy__brief-value">
          {planLevel3 != null && planLevel3 > 0 ? formatRub(planLevel3) : 'не задан'}
        </strong>
      </div>
      {!compact && prevMonthLabel ? (
        <p className="muted sales-strategy__brief-note">
          Доли НК/УК по залам — из отчёта за {prevMonthLabel} (в фоне, без отдельного блока).
        </p>
      ) : null}
    </div>
  )
}
