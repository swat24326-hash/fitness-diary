import { formatSetSummary, normalizeExerciseFormat } from '../lib/trainingExerciseFormat'
import { groupExercisesForDisplay } from '../lib/trainingSuperset'

function ExerciseBlock({ ex, sessionType }) {
  return (
    <div className="training-exercises-readonly__block" style={{ marginBottom: 8 }}>
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
  )
}

/** Список упражнений и подходов для просмотра (дневник клиента, админ-статистика). */
export function TrainingExercisesReadonly({ exercises, sessionType = 'Силовая' }) {
  const list = Array.isArray(exercises) ? exercises : []
  if (!list.length) return null

  const groups = groupExercisesForDisplay(list)

  return (
    <div className="training-exercises-readonly">
      {groups.map((g, gi) =>
        g.kind === 'superset' ? (
          <div key={`ss-${g.group}-${gi}`} className="training-exercises-readonly__superset">
            <p className="training-exercises-readonly__superset-label muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
              Суперсет {g.group}
            </p>
            {g.items.map((ex, i) => (
              <ExerciseBlock key={ex?.id ?? `${gi}-${i}`} ex={ex} sessionType={sessionType} />
            ))}
          </div>
        ) : (
          <ExerciseBlock key={g.items[0]?.id ?? gi} ex={g.items[0]} sessionType={sessionType} />
        ),
      )}
    </div>
  )
}
