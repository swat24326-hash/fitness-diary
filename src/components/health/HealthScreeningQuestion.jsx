import { useEffect, useState } from 'react'
import { HealthScreeningChips, HealthScreeningYesNo } from './HealthScreeningYesNo.jsx'

/** Строка «да / нет»; при «да» — уточнения (чипы) и «что именно». children — свои уточнения (зоны тела). */
export function HealthScreeningQuestion({ q, answer, onChange, disabled, children }) {
  const [note, setNote] = useState(answer?.note ?? '')
  useEffect(() => setNote(answer?.note ?? ''), [answer?.note])
  const yes = answer?.a === 'yes'

  const setA = (a) => onChange(a ? (a === 'yes' ? { ...answer, a } : { a }) : null)
  const commitNote = () => {
    if ((answer?.note ?? '') !== note.trim()) onChange({ ...answer, note: note.trim() })
  }

  return (
    <div className={`hscr-q${yes ? ' hscr-q--yes' : ''}`}>
      <div className="hscr-q__row">
        <div className="hscr-q__text">
          <span className="hscr-q__label">{q.label}</span>
          {q.hint ? <span className="hscr-q__hint">{q.hint}</span> : null}
        </div>
        <HealthScreeningYesNo value={answer?.a ?? null} onChange={setA} label={q.label} disabled={disabled} />
      </div>
      {yes ? (
        <div className="hscr-q__more">
          {q.details ? (
            <HealthScreeningChips options={q.details} value={answer.d ?? []} onChange={(d) => onChange({ ...answer, d })} disabled={disabled} label={`${q.label}: уточнение`} />
          ) : null}
          {children}
          <input
            className="input hscr-q__note"
            placeholder="Что именно (необязательно)"
            value={note}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            aria-label={`${q.label}: что именно`}
          />
        </div>
      ) : null}
    </div>
  )
}
