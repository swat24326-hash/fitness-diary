import { SCHEDULE_KINDS } from '../../lib/trainer/trainerScheduleKindCore.js'

/**
 * Категория записи: 5 плашек с цветом категории.
 * @param {{ value: string, onChange: (kind: string) => void }} props
 */
export function TrainerScheduleKindPicker({ value, onChange }) {
  return (
    <div className="trainer-schedule-kinds" role="radiogroup" aria-label="Категория записи">
      {SCHEDULE_KINDS.map((k) => (
        <button
          key={k.id}
          type="button"
          role="radio"
          aria-checked={value === k.id}
          className={`trainer-schedule-kinds__chip trainer-schedule-kind--${k.id}${value === k.id ? ' trainer-schedule-kinds__chip--on' : ''}`}
          onClick={() => onChange(k.id)}
        >
          <span className="trainer-schedule-kinds__dot" aria-hidden />
          {k.label}
        </button>
      ))}
    </div>
  )
}

/** Легенда под сеткой: что значит цвет. */
export function TrainerScheduleKindLegend() {
  return (
    <ul className="trainer-schedule-legend" aria-label="Цвета категорий">
      {SCHEDULE_KINDS.map((k) => (
        <li key={k.id} className={`trainer-schedule-legend__item trainer-schedule-kind--${k.id}`}>
          <span className="trainer-schedule-kinds__dot" aria-hidden />
          {k.label}
        </li>
      ))}
    </ul>
  )
}
