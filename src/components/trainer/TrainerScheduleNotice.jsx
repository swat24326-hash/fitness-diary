import { Undo2, X } from 'lucide-react'

/**
 * Плашка внизу экрана ежедневника: итог переноса / повтора, «Отменить».
 * @param {{
 *   notice: { text: string, tone: 'info' | 'error', undoEntry?: object } | null,
 *   onUndo?: () => void,
 *   onDismiss: () => void,
 * }} props
 */
export function TrainerScheduleNotice({ notice, onUndo, onDismiss }) {
  if (!notice) return null
  return (
    <div
      className={`trainer-schedule-notice trainer-schedule-notice--${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span className="trainer-schedule-notice__text">{notice.text}</span>
      {notice.undoEntry && onUndo ? (
        <button type="button" className="btn btn-secondary btn-sm trainer-schedule-notice__undo" onClick={onUndo}>
          <Undo2 size={16} aria-hidden />
          Отменить
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-icon-square btn-secondary trainer-schedule-notice__close"
        onClick={onDismiss}
        aria-label="Закрыть"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
