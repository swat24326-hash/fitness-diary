/**
 * Двойная шкала: ход задания (просмотр → работа → готово) и срок до дедлайна.
 *
 * @param {{ progress: ReturnType<import('../../lib/admin/iskraDispatchProgressCore.js').buildDispatchProgressForUi> }} props
 */
export function DispatchTaskProgressBar({ progress }) {
  if (!progress) return null

  const { workflow, time, stages } = progress
  const workflowFill =
    workflow.tone === 'declined' || workflow.tone === 'dismissed' ? 'declined' : workflow.tone
  const workflowWidth = workflow.pct === 0 && workflow.tone === 'pending' ? 6 : workflow.pct

  return (
    <div className="dispatch-task-progress" aria-label="Прогресс задания">
      <div className="dispatch-task-progress__row">
        <span className="dispatch-task-progress__label">Ход</span>
        <div className="dispatch-task-progress__track-wrap">
          <div
            className="dispatch-task-progress__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={workflow.pct}
            aria-label={`Ход задания: ${workflow.label}`}
          >
            <div
              className={`dispatch-task-progress__fill dispatch-task-progress__fill--workflow dispatch-task-progress__fill--${workflowFill}`}
              style={{ width: `${workflowWidth}%` }}
            />
            <ol className="dispatch-task-progress__steps" aria-hidden>
              {workflow.steps.map((step, idx) => (
                <li
                  key={step.id}
                  className={`dispatch-task-progress__step${idx <= workflow.step ? ' dispatch-task-progress__step--on' : ''}${idx === workflow.step ? ' dispatch-task-progress__step--current' : ''}`}
                  style={{ left: `${step.pct}%` }}
                  title={step.label}
                />
              ))}
            </ol>
          </div>
          <span className="dispatch-task-progress__caption">{workflow.label}</span>
        </div>
      </div>

      {stages?.total ? (
        <div className="dispatch-task-progress__row">
          <span className="dispatch-task-progress__label">Этапы</span>
          <div className="dispatch-task-progress__track-wrap">
            <div
              className="dispatch-task-progress__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stages.pct}
              aria-label={`Этапы: ${stages.label}`}
            >
              <div
                className={`dispatch-task-progress__fill dispatch-task-progress__fill--stages dispatch-task-progress__fill--${stages.tone}`}
                style={{ width: `${stages.pct || 6}%` }}
              />
            </div>
            <span className="dispatch-task-progress__caption">{stages.label}</span>
          </div>
        </div>
      ) : null}

      {time.pct != null ? (
        <div className="dispatch-task-progress__row">
          <span className="dispatch-task-progress__label">Срок</span>
          <div className="dispatch-task-progress__track-wrap">
            <div
              className="dispatch-task-progress__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={time.pct}
              aria-label={`Срок: ${time.label}`}
            >
              <div
                className={`dispatch-task-progress__fill dispatch-task-progress__fill--time dispatch-task-progress__fill--${time.tone}`}
                style={{ width: `${time.pct}%` }}
              />
            </div>
            <span className={`dispatch-task-progress__caption dispatch-task-progress__caption--${time.tone}`}>
              {time.label}
              {time.dueLabel ? <span className="dispatch-task-progress__due muted"> · {time.dueLabel}</span> : null}
            </span>
          </div>
        </div>
      ) : (
        <p className="dispatch-task-progress__no-due muted">Срок не задан</p>
      )}
    </div>
  )
}
