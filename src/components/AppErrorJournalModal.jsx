import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DiagnosticsPanel } from './DiagnosticsPanel'

export function AppErrorJournalModal({ open, onClose, onCleared, onCopyFeedback, context, onSyncNow, syncBusy, onSignOut }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-error-journal-title"
      onClick={onClose}
    >
      <div className="modal-panel app-error-journal" onClick={(e) => e.stopPropagation()}>
        <DiagnosticsPanel
          variant="modal"
          context={context}
          onSyncNow={onSyncNow}
          syncBusy={syncBusy}
          onCleared={onCleared}
          onClose={onClose}
          onCopyFeedback={onCopyFeedback}
          onSignOut={onSignOut}
        />
      </div>
    </div>,
    document.body,
  )
}
