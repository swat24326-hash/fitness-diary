import { Check } from 'lucide-react'

/**
 * @param {{
 *   stages: Array<{ id: string, title: string, done: boolean }>,
 *   busyStageId?: string,
 *   disabled?: boolean,
 *   onCompleteStage?: (stageId: string) => void,
 * }} props
 */
export function DispatchTaskStagesList({ stages = [], busyStageId = '', disabled = false, onCompleteStage }) {
  if (!stages.length) return null

  return (
    <ol className="dispatch-task-stages" aria-label="Этапы задания">
      {stages.map((stage, idx) => {
        const on = stage.done
        return (
          <li
            key={stage.id}
            className={`dispatch-task-stages__item${on ? ' dispatch-task-stages__item--done' : ''}`}
          >
            <span className="dispatch-task-stages__num" aria-hidden>
              {idx + 1}
            </span>
            <span className="dispatch-task-stages__title">{stage.title}</span>
            {on ? (
              <span className="dispatch-task-stages__done-badge" aria-label="Этап выполнен">
                <Check size={14} aria-hidden />
              </span>
            ) : onCompleteStage ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm dispatch-task-stages__done-btn"
                disabled={disabled || busyStageId === stage.id}
                onClick={() => onCompleteStage(stage.id)}
              >
                {busyStageId === stage.id ? '…' : 'Готово'}
              </button>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
