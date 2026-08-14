import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Период журнала связи — как степпер даты в продажах (◀ подпись ▶).
 *
 * @param {{
 *   periods: Array<{ id: string, label: string }>,
 *   value: string,
 *   onChange: (id: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export function ClubOutreachPeriodStepper({ periods, value, onChange, disabled = false }) {
  const list = Array.isArray(periods) ? periods : []
  const idx = Math.max(
    0,
    list.findIndex((p) => p.id === value),
  )
  const current = list[idx] ?? list[0]
  if (!current) return null

  const shift = (delta) => {
    if (disabled || list.length < 2) return
    const next = list[(idx + delta + list.length) % list.length]
    onChange(next.id)
  }

  return (
    <div className="club-call-period-stepper" role="group" aria-label="Период">
      <button
        type="button"
        className="club-call-period-stepper__btn btn btn-ghost btn-icon-square btn-touch"
        onClick={() => shift(-1)}
        disabled={disabled || list.length < 2}
        aria-label="Предыдущий период"
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <span className="club-call-period-stepper__pill" title={current.label}>
        <Calendar size={16} aria-hidden />
        <span className="club-call-period-stepper__text">{current.label}</span>
      </span>
      <button
        type="button"
        className="club-call-period-stepper__btn btn btn-ghost btn-icon-square btn-touch"
        onClick={() => shift(1)}
        disabled={disabled || list.length < 2}
        aria-label="Следующий период"
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  )
}
