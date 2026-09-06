import {
  SCHEDULE_VIEW_DAY,
  SCHEDULE_VIEW_DAYS3,
  SCHEDULE_VIEW_MONTH,
  SCHEDULE_VIEW_WEEK,
} from '../../lib/trainer/trainerScheduleCore.js'

const OPTIONS = [
  { id: SCHEDULE_VIEW_DAY, label: 'День' },
  { id: SCHEDULE_VIEW_DAYS3, label: '3 дня' },
  { id: SCHEDULE_VIEW_WEEK, label: 'Неделя' },
  { id: SCHEDULE_VIEW_MONTH, label: 'Месяц' },
]

/**
 * @param {{
 *   view: string,
 *   onChange: (view: string) => void,
 * }} props
 */
export function TrainerScheduleViewSwitcher({ view, onChange }) {
  return (
    <div className="trainer-schedule-view-switch" role="tablist" aria-label="Режим календаря">
      {OPTIONS.map((opt) => {
        const active = view === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={[
              'trainer-schedule-view-switch__btn',
              active ? 'trainer-schedule-view-switch__btn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
