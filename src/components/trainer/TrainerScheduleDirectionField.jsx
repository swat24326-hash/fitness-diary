import { SCHEDULE_KIND_GROUP } from '../../lib/trainer/trainerScheduleKindCore.js'

/**
 * Направление АЗ для категории «Групповое» (нужно для «Следующей» у клиента).
 * @param {{
 *   kind: string,
 *   value: string,
 *   onChange: (id: string) => void,
 *   options: Array<{ id: string, name: string }>,
 * }} props
 */
export function TrainerScheduleDirectionField({ kind, value, onChange, options }) {
  if (kind !== SCHEDULE_KIND_GROUP) return null
  if (!options?.length) {
    return (
      <p className="muted trainer-schedule-modal__hint" role="note">
        Нет направлений АЗ в клубе — групповое для клиентов АЗ пока недоступно
      </p>
    )
  }
  return (
    <label className="trainer-schedule-modal__field">
      <span>Направление АЗ</span>
      <select
        className="input"
        value={value || ''}
        onChange={(ev) => onChange(ev.target.value)}
        aria-label="Направление группового занятия"
        data-testid="schedule-direction"
      >
        <option value="">Выберите…</option>
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  )
}
