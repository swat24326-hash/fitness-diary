import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { INBOX_LIMITS, INBOX_QUESTION_TYPES, INBOX_QUESTION_TYPE_LABELS } from '../../lib/inbox/inboxCampaignCore.js'
import {
  changeInboxQuestionType,
  emptyInboxQuestion,
  inboxOptionsFromText,
  inboxQuestionHasOptions,
} from '../../lib/inbox/inboxAdminUiCore.js'

/** Редактор вопросов опроса: тип, текст, варианты (по строке), обязательность, порядок. */
export function AdminInboxQuestions({ questions, onChange, disabled }) {
  const patch = (i, next) => onChange(questions.map((q, j) => (j === i ? next : q)))
  const move = (i, d) => {
    const list = [...questions]
    ;[list[i], list[i + d]] = [list[i + d], list[i]]
    onChange(list)
  }
  return (
    <div className="admin-inbox__questions">
      {questions.map((q, i) => (
        <fieldset key={i} className="admin-inbox__question" disabled={disabled}>
          <legend className="admin-inbox__question-num">Вопрос {i + 1}</legend>
          <div className="admin-inbox__question-row">
            <select
              className="select admin-inbox__question-type"
              value={q.type}
              onChange={(e) => patch(i, changeInboxQuestionType(q, e.target.value))}
              aria-label={`Тип вопроса ${i + 1}`}
            >
              {INBOX_QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INBOX_QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <span className="admin-inbox__question-tools">
              <button type="button" className="btn btn-ghost btn-icon-square" onClick={() => move(i, -1)} disabled={i === 0} title="Выше" aria-label="Выше">
                <ArrowUp size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon-square"
                onClick={() => move(i, 1)}
                disabled={i === questions.length - 1}
                title="Ниже"
                aria-label="Ниже"
              >
                <ArrowDown size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon-square"
                onClick={() => onChange(questions.filter((_, j) => j !== i))}
                disabled={questions.length === 1}
                title="Удалить вопрос"
                aria-label="Удалить вопрос"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </span>
          </div>
          <input
            className="input"
            value={q.text}
            onChange={(e) => patch(i, { ...q, text: e.target.value })}
            maxLength={INBOX_LIMITS.questionText}
            placeholder="Текст вопроса"
            aria-label={`Текст вопроса ${i + 1}`}
          />
          {inboxQuestionHasOptions(q) ? (
            <textarea
              className="textarea admin-inbox__options"
              value={(q.options ?? []).join('\n')}
              onChange={(e) => patch(i, { ...q, options: inboxOptionsFromText(e.target.value) })}
              rows={3}
              placeholder={'Варианты — по одному на строку\nНапример: Утром\nВечером'}
              aria-label={`Варианты вопроса ${i + 1}`}
            />
          ) : null}
          <label className="admin-inbox__check">
            <input type="checkbox" checked={q.required !== false} onChange={(e) => patch(i, { ...q, required: e.target.checked })} />
            Обязательный
          </label>
        </fieldset>
      ))}
      {questions.length < INBOX_LIMITS.questions ? (
        <button type="button" className="btn btn-secondary btn-touch" onClick={() => onChange([...questions, emptyInboxQuestion('rating')])} disabled={disabled}>
          <Plus size={16} aria-hidden />
          Добавить вопрос
        </button>
      ) : null}
    </div>
  )
}
