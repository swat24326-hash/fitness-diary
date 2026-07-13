/**
 * Компактные шкалы для виджета на главной тренера.
 *
 * @param {{ progress: ReturnType<import('../../lib/admin/iskraDispatchProgressCore.js').buildDispatchProgressForUi> }} props
 */
export function DispatchTaskProgressMini({ progress }) {
  if (!progress) return null

  const { workflow, time } = progress
  const workflowFill =
    workflow.tone === 'declined' || workflow.tone === 'dismissed' ? 'declined' : workflow.tone
  const workflowWidth = workflow.pct === 0 && workflow.tone === 'pending' ? 8 : workflow.pct

  return (
    <div className="dispatch-progress-mini" aria-hidden>
      <div className="dispatch-progress-mini__row">
        <span className="dispatch-progress-mini__tag">Ход</span>
        <div className="dispatch-progress-mini__track">
          <div
            className={`dispatch-progress-mini__fill dispatch-progress-mini__fill--workflow dispatch-progress-mini__fill--${workflowFill}`}
            style={{ width: `${workflowWidth}%` }}
          />
        </div>
      </div>
      {time.pct != null ? (
        <div className="dispatch-progress-mini__row">
          <span className="dispatch-progress-mini__tag">Срок</span>
          <div className="dispatch-progress-mini__track">
            <div
              className={`dispatch-progress-mini__fill dispatch-progress-mini__fill--time dispatch-progress-mini__fill--${time.tone}`}
              style={{ width: `${time.pct}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
