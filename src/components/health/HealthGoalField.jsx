import { HEALTH_GOALS, composeHealthGoal, parseHealthGoal } from '../../lib/health/healthGoalCore.js'
import { stripDirectionControls } from '../../lib/textInput'

/** Цель в карте здоровья: выбрать одну из стандартных, ниже — уточнение («минус 10 кг к лету»). */
export function HealthGoalField({ value, onChange }) {
  const { id, detail } = parseHealthGoal(value)
  return (
    <div className="field hscr-goal">
      <span className="label" id="hscr-goal-label">
        Цель
      </span>
      <div className="hscr-chips" role="group" aria-labelledby="hscr-goal-label">
        {HEALTH_GOALS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={id === g.id}
            className={`hscr-chip${id === g.id ? ' hscr-chip--on' : ''}`}
            onClick={() => onChange(composeHealthGoal(id === g.id ? null : g.id, detail) ?? '')}
          >
            {g.label}
          </button>
        ))}
      </div>
      <input
        className="input hscr-goal__detail"
        aria-label="Уточнение цели"
        placeholder={id ? 'Уточнение: например, минус 10 кг к лету' : 'Выберите цель выше или опишите своими словами'}
        value={detail}
        onChange={(e) => onChange(composeHealthGoal(id, stripDirectionControls(e.target.value)) ?? '')}
      />
    </div>
  )
}
