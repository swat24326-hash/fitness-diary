import { formatRub } from '../lib/admin/salesReportCore.js'
import { formatDateRu } from '../lib/dateRu.js'
import { SalesStrategyPlaybookClosingsList } from './SalesStrategyPlaybookClosingsList.jsx'

/**
 * @param {{ week: object, clubId?: string }} props
 */
export function SalesStrategyPlaybookWeekCard({ week, clubId = '' }) {
  if (!week) return null
  const pct = Math.min(100, Math.max(0, Number(week.progress?.pct) || 0))

  return (
    <article className="sales-playbook__card" aria-label={`Неделя ${week.label}`}>
      <header className="sales-playbook__card-head">
        <div>
          <p className="sales-playbook__eyebrow">
            {week.label}
            {week.isCurrent ? ' · сейчас' : week.isPast ? ' · прошло' : ''}
          </p>
          <h4 className="sales-playbook__card-title">
            {formatDateRu(week.startIso)} – {formatDateRu(week.endIso)}
          </h4>
        </div>
        <div className="sales-playbook__card-target">
          <span className="muted">Цель недели</span>
          <strong>{formatRub(week.targetRub)}</strong>
        </div>
      </header>

      <div className="sales-playbook__bar" aria-hidden>
        <div className="sales-playbook__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="sales-playbook__progress-meta muted">
        Факт {formatRub(week.progress?.fact)} · {week.progress?.pct ?? 0}% от цели
        {week.progress?.gap > 0 ? ` · осталось ${formatRub(week.progress.gap)}` : ''}
      </p>

      <div className="sales-playbook__chips" aria-label="Ориентир НК ДК УК">
        <span className="sales-playbook__chip sales-playbook__chip--nk">
          НК <strong>{formatRub(week.nkOrient)}</strong>
        </span>
        <span className="sales-playbook__chip sales-playbook__chip--dk">
          ДК <strong>{formatRub(week.dkAmount)}</strong>
          <span className="muted">
            {' '}
            · {week.endingsOpenCount ?? week.endingsCount} откр.
            {(week.endingsConfirmedCount ?? 0) > 0
              ? ` · ${week.endingsConfirmedCount} ✓`
              : ''}
          </span>
        </span>
        <span className="sales-playbook__chip sales-playbook__chip--uk">
          УК <strong>{formatRub(week.ukOrient)}</strong>
        </span>
      </div>

      {week.dkOverTarget ? (
        <p className="sales-playbook__warn" role="status">
          Ориентир ДК по закрытиям выше темпа недели — остальные направления сжимаются.
        </p>
      ) : null}

      <h5 className="sales-playbook__list-title">Закрытия ДК</h5>
      <SalesStrategyPlaybookClosingsList endings={week.endings} clubId={clubId} />
    </article>
  )
}
