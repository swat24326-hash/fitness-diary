import { useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addCalendarDaysIso,
  formatDateRu,
  normalizeClubOpsDayIso,
  openNativeDatePicker,
  todayInTimeZoneIso,
} from '../../lib/dateRu.js'

/** Глубина календаря журнала (дней назад от сегодня МСК). */
export const CLUB_OUTREACH_DAY_LOOKBACK_MAX = 90

/**
 * Выбор дня журнала связи: ◀ дата ▶ + нативный календарь по тапу на дату.
 *
 * @param {{
 *   value: string,
 *   onChange: (iso: string) => void,
 *   disabled?: boolean,
 *   maxLookbackDays?: number,
 * }} props
 */
export function ClubOutreachDayStepper({
  value,
  onChange,
  disabled = false,
  maxLookbackDays = CLUB_OUTREACH_DAY_LOOKBACK_MAX,
}) {
  const inputRef = useRef(null)
  const today = todayInTimeZoneIso()
  const day = normalizeClubOpsDayIso(value, today) || today
  const minDay = addCalendarDaysIso(today, -Math.max(1, Math.floor(Number(maxLookbackDays) || 90) - 1))
  const label = formatDateRu(day)

  const shift = (delta) => {
    if (disabled) return
    let next = addCalendarDaysIso(day, delta)
    if (!next) return
    if (next > today) next = today
    if (minDay && next < minDay) next = minDay
    onChange(next)
  }

  const openPicker = (e) => {
    if (disabled) return
    e.preventDefault()
    openNativeDatePicker(inputRef.current)
  }

  return (
    <div className="club-call-period-stepper" role="group" aria-label="День журнала">
      <button
        type="button"
        className="club-call-period-stepper__btn btn btn-ghost btn-icon-square btn-touch"
        onClick={() => shift(-1)}
        disabled={disabled || day <= minDay}
        aria-label="Предыдущий день"
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <label
        className="club-call-period-stepper__pill club-call-period-stepper__pill--pick"
        title="Выбрать день в календаре"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openPicker(e)
        }}
      >
        <Calendar size={16} aria-hidden />
        <span className="club-call-period-stepper__text">{label}</span>
        <input
          ref={inputRef}
          type="date"
          className="club-call-period-stepper__date-input"
          value={day}
          min={minDay || undefined}
          max={today}
          disabled={disabled}
          onChange={(e) => {
            const next = normalizeClubOpsDayIso(e.target.value, today)
            if (next) onChange(next)
          }}
          aria-label="Выбрать день в календаре"
        />
      </label>
      <button
        type="button"
        className="club-call-period-stepper__btn btn btn-ghost btn-icon-square btn-touch"
        onClick={() => shift(1)}
        disabled={disabled || day >= today}
        aria-label="Следующий день"
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  )
}
