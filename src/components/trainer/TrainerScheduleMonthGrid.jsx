import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buildScheduleMonthGrid } from '../../lib/trainer/trainerScheduleCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   selectedDay?: string,
 *   countsByDay?: Record<string, number>,
 *   onSelectDay: (iso: string) => void,
 *   onPrevMonth: () => void,
 *   onNextMonth: () => void,
 * }} props
 */
export function TrainerScheduleMonthGrid({
  year,
  month,
  selectedDay = '',
  countsByDay = {},
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}) {
  const grid = buildScheduleMonthGrid(year, month)
  const today = todayInTimeZoneIso()
  const title = `${MONTH_NAMES[month - 1] ?? month} ${year}`

  return (
    <section className="trainer-schedule-month card" aria-label="Календарь месяца">
      <div className="trainer-schedule-month__head">
        <button type="button" className="btn btn-icon-square btn-secondary" onClick={onPrevMonth} aria-label="Предыдущий месяц">
          <ChevronLeft size={20} aria-hidden />
        </button>
        <h2 className="trainer-schedule-month__title">{title}</h2>
        <button type="button" className="btn btn-icon-square btn-secondary" onClick={onNextMonth} aria-label="Следующий месяц">
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
      <div className="trainer-schedule-month__weekdays" aria-hidden>
        {grid.weekdayLabels.map((label) => (
          <span key={label} className="trainer-schedule-month__weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="trainer-schedule-month__grid" role="grid" aria-label={title}>
        {grid.weeks.flatMap((week, wi) =>
          week.map((cell, di) => {
            if (!cell) {
              return <span key={`empty-${wi}-${di}`} className="trainer-schedule-month__cell trainer-schedule-month__cell--empty" />
            }
            const count = countsByDay[cell.iso] ?? 0
            const isToday = cell.iso === today
            const isSelected = cell.iso === selectedDay
            return (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                className={[
                  'trainer-schedule-month__cell',
                  isToday ? 'trainer-schedule-month__cell--today' : '',
                  isSelected ? 'trainer-schedule-month__cell--selected' : '',
                  count > 0 ? 'trainer-schedule-month__cell--busy' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectDay(cell.iso)}
                aria-label={`${cell.day}${count ? `, записей: ${count}` : ''}`}
                aria-pressed={isSelected}
              >
                <span className="trainer-schedule-month__day">{cell.day}</span>
                {count > 0 ? <span className="trainer-schedule-month__dot" aria-hidden /> : null}
              </button>
            )
          }),
        )}
      </div>
    </section>
  )
}
