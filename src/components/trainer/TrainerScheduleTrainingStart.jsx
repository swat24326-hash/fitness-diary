import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { buildScheduleWorkoutNewPath } from '../../lib/trainer/trainerScheduleTrainingCore.js'

/**
 * «Начать / Продолжить тренировку» по записи; у нескольких клиентов — выбор, с кого начать.
 * @param {{ start: object, clientNameById?: Record<string, string> }} props start — resolveScheduleTrainingStart
 */
export function TrainerScheduleTrainingStart({ start, clientNameById = {} }) {
  const nav = useNavigate()
  if (start.kind === 'open' || start.kind === 'new') {
    return (
      <button type="button" className="btn btn-primary trainer-schedule-modal__start" onClick={() => nav(start.path)}>
        <Play size={16} aria-hidden />
        {start.label}
      </button>
    )
  }
  if (start.kind !== 'pick_client') return null
  return (
    <div className="trainer-schedule-modal__pick-clients">
      <p className="trainer-schedule-modal__hint muted">С кого начать тренировку?</p>
      <ul className="trainer-schedule-modal__pick-list">
        {start.clientIds.map((cid) => (
          <li key={cid}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => nav(buildScheduleWorkoutNewPath(cid, start.dayDate, start.scheduleEntryId, start.workoutsBase))}
            >
              {clientNameById[cid] ?? 'Клиент'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
