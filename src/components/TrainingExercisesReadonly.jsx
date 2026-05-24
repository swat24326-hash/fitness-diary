import { formatSetSummary, normalizeExerciseFormat } from '../lib/trainingExerciseFormat'

/** Список упражнений и подходов для просмотра (дневник клиента, админ-статистика). */
export function TrainingExercisesReadonly({ exercises, sessionType = 'Силовая' }) {
  const list = Array.isArray(exercises) ? exercises : []
  if (!list.length) return null

  return (
    <div className="training-exercises-readonly">
      {list.map((ex, i) => (
        <div key={ex?.id ?? i} className="training-exercises-readonly__block" style={{ marginBottom: 12 }}>
          <p className="modal-kv u-mb-4" style={{ margin: '0 0 6px' }}>
            <strong>{ex?.name?.trim() || 'Упражнение'}</strong>
            <span className="muted" style={{ fontWeight: 400 }}>
              {' '}
              · {normalizeExerciseFormat(ex?.format, sessionType)}
            </span>
          </p>
          {(ex?.sets ?? []).map((st, j) => (
            <p key={j} className="modal-kv u-ml-8" style={{ margin: '0 0 4px' }}>
              Подход {j + 1}: {formatSetSummary(st, ex?.format ?? sessionType)}
              {st?.comment ? ` — ${st.comment}` : ''}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}
