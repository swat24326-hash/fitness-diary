import { Send, Share2, Trash2 } from 'lucide-react'
import { countHomeworkExercises } from '../../lib/homework/homeworkPlanCore.js'

/**
 * Превью черновика ДЗ + комментарий + отправка в Max / другой мессенджер.
 */
export function HomeworkPlanDisplay({
  draft,
  readOnly = false,
  busy = false,
  onCommentChange,
  onPatchExercise,
  onRemoveExercise,
  onSendMax,
  onSendOther,
  onClear,
  statusMsg = '',
}) {
  const count = countHomeworkExercises(draft)
  if (!draft || count === 0) {
    return (
      <section className="card homework-preview homework-preview--empty" aria-live="polite">
        <p className="homework-preview__empty-title">Почти готово</p>
        <p className="muted homework-preview__empty-text">
          Выберите шаблон сверху — или откройте конструктор и добавьте упражнения. Затем отправьте в Max или другой
          мессенджер.
        </p>
      </section>
    )
  }

  return (
    <section className="card homework-preview">
      <header className="homework-preview__head">
        <div>
          <p className="homework-preview__eyebrow">Превью карточки</p>
          <h3 className="homework-preview__title">{draft.title || 'Домашнее задание'}</h3>
        </div>
        <div className="homework-preview__head-right">
          <span className="homework-preview__count">{count}</span>
          {!readOnly && onClear ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}>
              Сбросить
            </button>
          ) : null}
        </div>
      </header>

      <div className="homework-preview__blocks">
        {(draft.blocks ?? []).map((block, bIdx) =>
          (block.exercises ?? []).length ? (
            <div key={`${block.label}-${bIdx}`} className="homework-preview__block">
              <h4 className="homework-preview__block-title">{block.label}</h4>
              <ul className="homework-preview__list">
                {block.exercises.map((ex, exIdx) => (
                  <li key={`${ex.catalog_exercise_id ?? ex.name}-${exIdx}`} className="homework-preview__row">
                    <span className="homework-preview__name">{ex.name}</span>
                    {!readOnly ? (
                      <div className="homework-preview__meta-inputs" aria-label={`Нормы для ${ex.name}`}>
                        <label className="homework-preview__field">
                          <span>подх.</span>
                          <input
                            className="input input-sm"
                            type="number"
                            min={1}
                            max={20}
                            value={ex.sets}
                            onChange={(e) => onPatchExercise?.(bIdx, exIdx, { sets: Number(e.target.value) || 1 })}
                          />
                        </label>
                        <label className="homework-preview__field">
                          <span>повт.</span>
                          <input
                            className="input input-sm"
                            value={ex.reps}
                            onChange={(e) => onPatchExercise?.(bIdx, exIdx, { reps: e.target.value })}
                          />
                        </label>
                        <label className="homework-preview__field">
                          <span>отдых</span>
                          <input
                            className="input input-sm"
                            type="number"
                            min={0}
                            max={600}
                            value={ex.rest_sec}
                            onChange={(e) =>
                              onPatchExercise?.(bIdx, exIdx, { rest_sec: Number(e.target.value) || 0 })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-icon-square btn-touch"
                          aria-label={`Убрать ${ex.name}`}
                          title="Убрать"
                          onClick={() => onRemoveExercise?.(bIdx, exIdx)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="homework-preview__chip">
                        {ex.sets}×{ex.reps}
                        {ex.rest_sec > 0 ? ` · ${ex.rest_sec} с` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>

      {!readOnly ? (
        <label className="homework-preview__comment">
          <span>Комментарий клиенту (по желанию)</span>
          <textarea
            className="input"
            rows={2}
            maxLength={500}
            value={draft.comment ?? ''}
            onChange={(e) => onCommentChange?.(e.target.value)}
            placeholder="Через день · без боли · дыхание ровное"
          />
        </label>
      ) : draft.comment ? (
        <p className="homework-preview__comment-ro">
          <strong>Комментарий:</strong> {draft.comment}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="homework-preview__actions homework-preview__actions--sticky">
          <div className="homework-preview__send-row">
            <button
              type="button"
              className="btn btn-touch homework-preview__send"
              disabled={busy || count === 0}
              onClick={() => void onSendMax?.()}
            >
              <Send size={18} aria-hidden />
              {busy ? 'Готовим…' : 'В Max'}
            </button>
            <button
              type="button"
              className="btn btn-touch btn-ghost homework-preview__send-other"
              disabled={busy || count === 0}
              onClick={() => void onSendOther?.()}
            >
              <Share2 size={18} aria-hidden />
              Другой мессенджер
            </button>
          </div>
          {statusMsg ? <p className="homework-preview__status">{statusMsg}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
