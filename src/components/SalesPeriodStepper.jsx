import { useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { openNativeDatePicker, todayLocalIso } from '../lib/dateRu.js'

/**
 * Общий переключатель периода для шапки продаж (день или месяц).
 * @param {{
 *   mode?: 'day' | 'month',
 *   label: string,
 *   reportDate?: string,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   onDateChange?: (iso: string) => void,
 *   className?: string,
 * }} props
 */
export function SalesPeriodStepper({
  mode = 'day',
  label,
  reportDate = '',
  onPrev,
  onNext,
  onDateChange,
  className = '',
}) {
  const dateInputRef = useRef(null)
  const isDay = mode === 'day'

  const openPicker = (e) => {
    if (!isDay) return
    e.preventDefault()
    openNativeDatePicker(dateInputRef.current)
  }

  const rootClass = ['sales-report__date-stepper', 'sales-report__date-stepper--tabs', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} role="group" aria-label={isDay ? 'Дата отчёта' : 'Месяц отчёта'}>
      <button
        type="button"
        className="sales-report__date-btn"
        onClick={onPrev}
        aria-label={isDay ? 'Предыдущий день' : 'Предыдущий месяц'}
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      {isDay ? (
        <label
          className="sales-report__date-pill"
          title="Выбрать дату в календаре"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') openPicker(e)
          }}
        >
          <Calendar size={16} aria-hidden />
          <span className="sales-report__date-text">{label}</span>
          <input
            ref={dateInputRef}
            type="date"
            className="sales-report__date-input-overlay"
            value={reportDate}
            max={todayLocalIso()}
            onChange={(e) => onDateChange?.(e.target.value)}
            aria-label="Дата отчёта — открыть календарь"
          />
        </label>
      ) : (
        <span className="sales-report__date-pill sales-report__date-pill--static" title={label}>
          <Calendar size={16} aria-hidden />
          <span className="sales-report__date-text">{label}</span>
        </span>
      )}
      <button
        type="button"
        className="sales-report__date-btn"
        onClick={onNext}
        aria-label={isDay ? 'Следующий день' : 'Следующий месяц'}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  )
}
