import { formatIsoRu, PERIOD_PRESETS } from '../../lib/period'
import { AdminClubStatsHallTabs } from './AdminClubStatsHallTabs.jsx'

const PERIOD_SHORT = {
  month: { label: 'Месяц', title: 'Календарный месяц' },
  today: { label: 'Сегодня', title: 'Сегодня' },
  custom: { label: 'Свой', title: 'Свой период' },
}

/**
 * Компактная полоска: зал (админ) + период + диапазон/даты справа.
 */
export function AdminClubStatsPeriodBar({
  showHall = false,
  hall,
  onHallChange,
  period,
  onPeriodChange,
  range,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  end = null,
}) {
  return (
    <div className="admin-club-stats-period">
      <div className="admin-club-stats-period__row">
        {showHall ? (
          <>
            <AdminClubStatsHallTabs value={hall} onChange={onHallChange} />
            <span className="admin-club-stats-period__sep" aria-hidden />
          </>
        ) : null}
        <div className="admin-club-stats-period__presets" role="group" aria-label="Период">
          {PERIOD_PRESETS.map((p) => {
            const short = PERIOD_SHORT[p.id] || { label: p.label, title: p.label }
            const active = period === p.id
            return (
              <button
                key={p.id}
                type="button"
                className={`admin-club-stats-period__chip${active ? ' is-active' : ''}`}
                title={short.title}
                aria-pressed={active}
                onClick={() => onPeriodChange(p.id)}
              >
                {short.label}
              </button>
            )
          })}
        </div>
        {period === 'custom' ? (
          <div className="admin-club-stats-period__custom">
            <label className="admin-club-stats-period__date">
              <span className="sr-only">С</span>
              <input
                className="input"
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFrom(e.target.value)}
                required
                aria-label="Дата с"
              />
            </label>
            <span className="admin-club-stats-period__dash" aria-hidden>
              —
            </span>
            <label className="admin-club-stats-period__date">
              <span className="sr-only">По</span>
              <input
                className="input"
                type="date"
                value={customTo}
                onChange={(e) => onCustomTo(e.target.value)}
                required
                aria-label="Дата по"
              />
            </label>
          </div>
        ) : (
          <p className="admin-club-stats-period__range muted">
            {range?.start && range?.end ? (
              <>
                {formatIsoRu(range.start)} — {formatIsoRu(range.end)}
              </>
            ) : (
              '—'
            )}
          </p>
        )}
        {end}
      </div>
    </div>
  )
}
