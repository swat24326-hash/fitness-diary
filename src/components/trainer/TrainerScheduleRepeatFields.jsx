import { Repeat } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import { pluralRu } from '../../lib/client/clientMeUiCore.js'
import { SCHEDULE_REPEAT_WEEK_OPTIONS } from '../../lib/trainer/trainerScheduleRecurrenceCore.js'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/**
 * «Повторять каждую неделю»: дни недели + на сколько недель + итог.
 * @param {{
 *   enabled: boolean,
 *   onToggle: (next: boolean) => void,
 *   weekdays: number[],
 *   onWeekdays: (next: number[]) => void,
 *   weeks: number,
 *   onWeeks: (next: number) => void,
 *   plan: { days: string[], skipped: number },
 * }} props
 */
export function TrainerScheduleRepeatFields({ enabled, onToggle, weekdays, onWeekdays, weeks, onWeeks, plan }) {
  const toggleDay = (i) =>
    onWeekdays(weekdays.includes(i) ? weekdays.filter((d) => d !== i) : [...weekdays, i].sort((a, b) => a - b))
  const last = plan.days[plan.days.length - 1]

  return (
    <div className="trainer-schedule-repeat">
      <label className="trainer-schedule-repeat__toggle">
        <input type="checkbox" checked={enabled} onChange={(ev) => onToggle(ev.target.checked)} />
        <Repeat size={16} aria-hidden />
        <span>Повторять каждую неделю</span>
      </label>
      {enabled ? (
        <>
          <div className="trainer-schedule-repeat__days" role="group" aria-label="Дни недели">
            {WEEKDAYS.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={weekdays.includes(i)}
                className={[
                  'trainer-schedule-repeat__day',
                  weekdays.includes(i) ? 'trainer-schedule-repeat__day--on' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => toggleDay(i)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="trainer-schedule-modal__field">
            <span>Сколько недель</span>
            <select value={weeks} onChange={(ev) => onWeeks(Number(ev.target.value))}>
              {SCHEDULE_REPEAT_WEEK_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w} нед.
                </option>
              ))}
            </select>
          </label>
          <p className="trainer-schedule-repeat__summary muted" role="status">
            {plan.days.length
              ? `Ещё ${plan.days.length} ${pluralRu(plan.days.length, 'запись', 'записи', 'записей')} до ${formatDateRu(last).slice(0, 5)}`
              : 'Нет дней для копий — выберите дни недели'}
            {plan.skipped ? ` · ${plan.skipped} уже есть, пропустим` : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}
