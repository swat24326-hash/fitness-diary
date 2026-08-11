import {
  CLUB_STATS_HALLS,
  CLUB_STATS_HALL_LABELS,
} from '../../lib/admin/clubStatsHallFilterCore.js'

/**
 * Вкладки зала на сводке статистики клуба.
 *
 * @param {{
 *   value: 'pz'|'tz'|'az',
 *   onChange: (hall: 'pz'|'tz'|'az') => void,
 * }} props
 */
export function AdminClubStatsHallTabs({ value, onChange }) {
  return (
    <div className="admin-club-stats-hall" role="tablist" aria-label="Зал статистики">
      {CLUB_STATS_HALLS.map((hall) => {
        const active = value === hall
        return (
          <button
            key={hall}
            type="button"
            role="tab"
            aria-selected={active}
            className={`admin-club-stats-hall__btn${active ? ' is-active' : ''}`}
            onClick={() => onChange(hall)}
          >
            {CLUB_STATS_HALL_LABELS[hall]}
          </button>
        )
      })}
    </div>
  )
}
