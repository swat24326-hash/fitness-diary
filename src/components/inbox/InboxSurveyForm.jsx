import { useState } from 'react'
import { Check, Send, Star } from 'lucide-react'
import { firstMissingInboxAnswer, toggleInboxMultiOption } from '../../lib/client/clientInboxUiCore.js'

function RatingInput({ value, onChange, disabled, label }) {
  return (
    <div className="client-survey__stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} из 5`}
          className={`client-survey__star${value != null && n <= value ? ' client-survey__star--on' : ''}`}
          onClick={() => onChange(n)}
          disabled={disabled}
        >
          <Star size={30} aria-hidden />
        </button>
      ))}
    </div>
  )
}

function OptionsInput({ q, value, onChange, disabled }) {
  const multi = q.type === 'multi'
  return (
    <div className="client-survey__options" role={multi ? 'group' : 'radiogroup'} aria-label={q.text}>
      {q.options.map((label, i) => {
        const on = multi ? Array.isArray(value) && value.includes(i) : value === i
        return (
          <button
            key={label}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            className={`client-survey__option${on ? ' client-survey__option--on' : ''}`}
            onClick={() => onChange(multi ? toggleInboxMultiOption(value, i) : i)}
            disabled={disabled}
          >
            <span className="client-survey__mark" aria-hidden>
              {on ? <Check size={14} /> : null}
            </span>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Форма опроса «Входящих» (клиент и сотрудник); readOnly — показать свои отправленные ответы.
 * @param {{ questions: object[], initial?: object|null, readOnly?: boolean, sending?: boolean, error?: string, onSubmit?: (a: object) => void, cardClass?: string }} props
 */
export function InboxSurveyForm({ questions, initial = null, readOnly = false, sending = false, error = '', onSubmit, cardClass = 'client-me-card' }) {
  const [answers, setAnswers] = useState(() => initial ?? {})
  const [missing, setMissing] = useState(0)
  const set = (id, v) => {
    setAnswers((a) => ({ ...a, [id]: v }))
    setMissing(0)
  }
  const disabled = readOnly || sending

  const submit = (e) => {
    e.preventDefault()
    const gap = firstMissingInboxAnswer(questions, answers)
    if (gap) {
      setMissing(gap)
      document.getElementById(`client-survey-q${gap}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    onSubmit?.(answers)
  }

  return (
    <form className="client-survey" onSubmit={submit} noValidate>
      {questions.map((q, i) => (
        <fieldset
          key={q.id}
          id={`client-survey-q${i + 1}`}
          className={`${cardClass} client-survey__q${missing === i + 1 ? ' client-survey__q--missing' : ''}`}
        >
          <legend className="client-survey__text">
            <span className="client-survey__num">{i + 1}</span>
            {q.text}
            {q.required ? null : <small className="client-me-muted"> · можно пропустить</small>}
          </legend>
          {q.type === 'rating' ? (
            <RatingInput value={answers[q.id] ?? null} onChange={(v) => set(q.id, v)} disabled={disabled} label={q.text} />
          ) : null}
          {q.type === 'single' || q.type === 'multi' ? (
            <OptionsInput q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} disabled={disabled} />
          ) : null}
          {q.type === 'text' ? (
            <textarea
              className="textarea client-survey__textarea"
              value={answers[q.id] ?? ''}
              onChange={(e) => set(q.id, e.target.value)}
              disabled={disabled}
              maxLength={2000}
              rows={3}
              placeholder={readOnly ? '' : 'Ваш ответ'}
              aria-label={q.text}
            />
          ) : null}
          {missing === i + 1 ? (
            <p className="client-onb__error" role="alert">
              Ответьте на этот вопрос
            </p>
          ) : null}
        </fieldset>
      ))}
      {readOnly ? null : (
        <>
          {error ? (
            <p className="client-onb__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-touch client-survey__send" disabled={sending}>
            <Send size={18} aria-hidden />
            {sending ? 'Отправляем…' : 'Отправить ответы'}
          </button>
        </>
      )}
    </form>
  )
}
