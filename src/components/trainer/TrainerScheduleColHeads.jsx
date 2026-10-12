import { weekdayShortRu } from '../../lib/trainer/trainerScheduleCore.js'
import { formatDateRu } from '../../lib/dateRu.js'

/**
 * Шапки колонок одного экрана («Пн 12.10»…); тап открывает день, если передан onOpenDay.
 * @param {{ dayIsos: string[], todayIso: string, interactive: boolean, onOpenDay?: (dayIso: string) => void }} props
 */
export function TrainerScheduleColHeads({ dayIsos, todayIso, interactive, onOpenDay }) {
  const canOpen = interactive && typeof onOpenDay === 'function'
  return dayIsos.map((dayIso) => {
    const label = (
      <>
        <span className="trainer-schedule-day__col-wd">{weekdayShortRu(dayIso)}</span>{' '}
        <span className="trainer-schedule-day__col-date">{formatDateRu(dayIso).slice(0, 5)}</span>
      </>
    )
    const className = [
      'trainer-schedule-day__col-head',
      !canOpen ? 'trainer-schedule-day__col-head--static' : '',
      dayIso === todayIso ? 'trainer-schedule-day__col-head--today' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return canOpen ? (
      <button
        key={dayIso}
        type="button"
        className={className}
        onClick={() => onOpenDay(dayIso)}
        aria-label={`Открыть день ${formatDateRu(dayIso)}`}
      >
        {label}
      </button>
    ) : (
      <span key={dayIso} className={className}>
        {label}
      </span>
    )
  })
}
