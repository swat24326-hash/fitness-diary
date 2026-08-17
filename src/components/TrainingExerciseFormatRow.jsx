import {
  TRAINING_EXERCISE_FORMATS,
  exerciseFormatAllowsLaterality,
  normalizeExerciseFormat,
} from '../lib/trainingExerciseFormat'

/**
 * Формат 1/2/3 (силовая / функциональная / кардио) и отдельный тумблер Л/П.
 */
export function TrainingExerciseFormatRow({
  format,
  lateralityOn,
  sessionFallback = 'Силовая',
  onFormatChange,
  onLateralityToggle,
}) {
  const current = normalizeExerciseFormat(format, sessionFallback)
  const lrAllowed = exerciseFormatAllowsLaterality(current)

  return (
    <div className="row exercise-format-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>
        Формат
      </span>
      {TRAINING_EXERCISE_FORMATS.map((t, i) => {
        const active = current === t
        return (
          <button
            key={t}
            type="button"
            className={`btn ${active ? 'btn-primary' : 'btn-ghost'} btn-icon-square btn-icon-xs`}
            onClick={() => onFormatChange(t)}
            title={`Формат ${i + 1}: ${t}`}
            aria-label={`Формат ${i + 1}: ${t}`}
            aria-pressed={active}
          >
            {i + 1}
          </button>
        )
      })}
      <span className="exercise-format-row__split" aria-hidden />
      <button
        type="button"
        className={`btn ${lateralityOn && lrAllowed ? 'btn-primary' : 'btn-ghost'} btn-icon-square btn-icon-xs exercise-format-row__lr`}
        onClick={onLateralityToggle}
        disabled={!lrAllowed}
        title={
          lrAllowed
            ? lateralityOn
              ? 'Обычный подход (выключить — оставим левую сторону)'
              : 'Разбить подход на левую и правую сторону'
            : 'Л/П только для силовой и функциональной'
        }
        aria-label="Левая и правая сторона в одном подходе"
        aria-pressed={lateralityOn && lrAllowed}
      >
        Л/П
      </button>
    </div>
  )
}
