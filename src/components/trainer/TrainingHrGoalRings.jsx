/**
 * Концентрические кольца целей: полное заполнение = цель (Garmin-стиль).
 * Легенда под кольцами в той же колонке.
 * @param {{
 *   rings: Array<{
 *     key: string,
 *     title: string,
 *     fill: number,
 *     valueLabel: string,
 *     goalLabel: string,
 *   }>,
 * }} props
 */
export function TrainingHrGoalRings({ rings }) {
  if (!Array.isArray(rings) || rings.length === 0) return null

  const size = 112
  const cx = 56
  const cy = 56
  const stroke = 8
  const gap = 3.5
  const outerR = 50
  const filledCount = rings.filter((r) => r.fill >= 0.999).length

  return (
    <div
      className="hr-goal-rings"
      role="img"
      aria-label={rings.map((r) => `${r.title}: ${r.valueLabel} из ${r.goalLabel}`).join('. ')}
    >
      <svg className="hr-goal-rings__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {rings.map((ring, i) => {
          const r = outerR - i * (stroke + gap)
          const circ = 2 * Math.PI * r
          const fill = Math.max(0, Math.min(1, Number(ring.fill) || 0))
          const dash = `${(circ * fill).toFixed(2)} ${(circ * (1 - fill)).toFixed(2)}`
          return (
            <g key={ring.key} className={`hr-goal-rings__layer hr-goal-rings__layer--${ring.key}`}>
              <circle
                className="hr-goal-rings__track"
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                strokeWidth={stroke}
              />
              <circle
                className="hr-goal-rings__value"
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={dash}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            </g>
          )
        })}
      </svg>
      <ul className="hr-goal-rings__legend">
        {rings.map((ring) => (
          <li key={ring.key} className={`hr-goal-rings__item hr-goal-rings__item--${ring.key}`}>
            <span className="hr-goal-rings__swatch" aria-hidden />
            <span className="hr-goal-rings__name">{ring.title}</span>
            <span className="hr-goal-rings__frac">
              {ring.valueLabel}
              <span className="hr-goal-rings__of">/{ring.goalLabel}</span>
            </span>
          </li>
        ))}
      </ul>
      {filledCount > 0 ? (
        <p className="hr-goal-rings__done">
          Заполнено {filledCount} из {rings.length}
        </p>
      ) : (
        <p className="hr-goal-rings__done hr-goal-rings__done--empty">Полное кольцо = цель</p>
      )}
    </div>
  )
}
