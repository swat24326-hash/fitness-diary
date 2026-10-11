import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buildScheduleMonthGrid } from '../../lib/trainer/trainerScheduleCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import { useScheduleSwipe } from '../../hooks/useScheduleSwipe.js'
import { TrainerScheduleMonthPicker } from './TrainerScheduleMonthPicker.jsx'

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
 *   swipeNav?: boolean,
 *   headEnd?: import('react').ReactNode,
 *   onPickMonth?: (year: number, month: number) => void,
 *   showCounts?: boolean,
 * }} props
 * showCounts — админ: в клетке число записей вместо точки (загрузка зала по дням).
 * onPickMonth — заголовок «Октябрь 2026 ▾» открывает выбор месяца и года.
 * swipeNav — телефон: месяц листается пальцем вбок, без стрелок.
 * headEnd — кнопка справа в шапке; слева ставится пустышка той же ширины, чтобы месяц стоял по центру.
 */
export function TrainerScheduleMonthGrid({
  year,
  month,
  selectedDay = '',
  countsByDay = {},
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  swipeNav = false,
  headEnd = null,
  onPickMonth,
  showCounts = false,
}) {
  const grid = buildScheduleMonthGrid(year, month)
  const today = todayInTimeZoneIso()
  const title = `${MONTH_NAMES[month - 1] ?? month} ${year}`
  const areaRef = useRef(/** @type {HTMLElement | null} */ (null))
  const bodyRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  useScheduleSwipe({ areaRef, contentRef: bodyRef, enabled: swipeNav, onPrev: onPrevMonth, onNext: onNextMonth })

  return (
    <section
      className={['trainer-schedule-month card', swipeNav ? 'trainer-schedule-month--swipe' : ''].filter(Boolean).join(' ')}
      aria-label="Календарь месяца"
      ref={areaRef}
    >
      <div className="trainer-schedule-month__head">
        {headEnd ? <span className="trainer-schedule-month__head-spacer" aria-hidden /> : null}
        {swipeNav ? null : (
          <button type="button" className="btn btn-icon-square btn-secondary" onClick={onPrevMonth} aria-label="Предыдущий месяц">
            <ChevronLeft size={20} aria-hidden />
          </button>
        )}
        {onPickMonth ? (
          <TrainerScheduleMonthPicker title={title} year={year} month={month} onPick={onPickMonth} />
        ) : (
          <h2 className="trainer-schedule-month__title">{title}</h2>
        )}
        {swipeNav ? null : (
          <button type="button" className="btn btn-icon-square btn-secondary" onClick={onNextMonth} aria-label="Следующий месяц">
            <ChevronRight size={20} aria-hidden />
          </button>
        )}
        {headEnd}
      </div>
      <div className="trainer-schedule-month__body" ref={bodyRef}>
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
                  {count > 0 && showCounts ? (
                    <span className="trainer-schedule-month__count" aria-hidden>
                      {count}
                    </span>
                  ) : count > 0 ? (
                    <span className="trainer-schedule-month__dot" aria-hidden />
                  ) : null}
                </button>
              )
            }),
          )}
        </div>
      </div>
    </section>
  )
}
