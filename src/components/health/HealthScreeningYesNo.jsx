/** «Нет / Да» для вопроса анкеты; повторное нажатие снимает ответ («не спрашивали»). */
export function HealthScreeningYesNo({ value, onChange, label, disabled }) {
  const pick = (v) => onChange(value === v ? null : v)
  return (
    <div className="hscr-yn" role="group" aria-label={label}>
      <button type="button" className={`hscr-yn__btn${value === 'no' ? ' hscr-yn__btn--no' : ''}`} aria-pressed={value === 'no'} disabled={disabled} onClick={() => pick('no')}>
        Нет
      </button>
      <button type="button" className={`hscr-yn__btn${value === 'yes' ? ' hscr-yn__btn--yes' : ''}`} aria-pressed={value === 'yes'} disabled={disabled} onClick={() => pick('yes')}>
        Да
      </button>
    </div>
  )
}

/** Чипы-варианты (несколько или один). */
export function HealthScreeningChips({ options, value, onChange, multi = true, disabled, label }) {
  const list = multi ? (value ?? []) : value
  const isOn = (id) => (multi ? list.includes(id) : list === id)
  const toggle = (id) => {
    if (!multi) return onChange(list === id ? null : id)
    onChange(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }
  return (
    <div className="hscr-chips" role="group" aria-label={label}>
      {Object.entries(options).map(([id, text]) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-pressed={isOn(id)}
          className={`hscr-chip${isOn(id) ? ' hscr-chip--on' : ''}`}
          onClick={() => toggle(id)}
        >
          {typeof text === 'string' ? text : text.label}
        </button>
      ))}
    </div>
  )
}
