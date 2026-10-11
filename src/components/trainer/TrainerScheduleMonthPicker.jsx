import { useCallback, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.js'

const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

/**
 * Заголовок месяца — кнопка: тап открывает год со стрелками и 12 месяцев.
 * @param {{ title: string, year: number, month: number, onPick: (year: number, month: number) => void }} props
 */
export function TrainerScheduleMonthPicker({ title, year, month, onPick }) {
  const [open, setOpen] = useState(false)
  const [pickYear, setPickYear] = useState(year)
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const close = useCallback(() => setOpen(false), [])
  usePopoverDismiss(open, close, rootRef)
  const [todayYear, todayMonth] = todayInTimeZoneIso().split('-').map(Number)

  return (
    <div className="trainer-schedule-month-picker" ref={rootRef}>
      <h2 className="trainer-schedule-month__title">
        <button
          type="button"
          className="trainer-schedule-month-picker__toggle"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${title}, выбрать месяц`}
          onClick={() => {
            setPickYear(year)
            setOpen((v) => !v)
          }}
        >
          {title}
          <ChevronDown size={18} aria-hidden className="trainer-schedule-month-picker__chevron" />
        </button>
      </h2>
      {open ? (
        <div className="trainer-schedule-month-picker__panel" role="dialog" aria-label="Выбор месяца">
          <div className="trainer-schedule-month-picker__year">
            <button
              type="button"
              className="trainer-schedule-month-picker__year-btn"
              onClick={() => setPickYear((y) => y - 1)}
              aria-label="Предыдущий год"
            >
              <ChevronLeft size={20} aria-hidden />
            </button>
            <span>{pickYear}</span>
            <button
              type="button"
              className="trainer-schedule-month-picker__year-btn"
              onClick={() => setPickYear((y) => y + 1)}
              aria-label="Следующий год"
            >
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
          <div className="trainer-schedule-month-picker__grid">
            {MONTH_SHORT.map((label, i) => {
              const m = i + 1
              const selected = pickYear === year && m === month
              const current = pickYear === todayYear && m === todayMonth
              return (
                <button
                  key={label}
                  type="button"
                  className={[
                    'trainer-schedule-month-picker__month',
                    selected ? 'trainer-schedule-month-picker__month--selected' : '',
                    current ? 'trainer-schedule-month-picker__month--today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selected}
                  onClick={() => {
                    setOpen(false)
                    onPick(pickYear, m)
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
