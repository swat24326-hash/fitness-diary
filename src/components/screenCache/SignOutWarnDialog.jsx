import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { signOutWarnCopy } from '../../lib/screenCache/signOutWarnCore.js'

/**
 * Окно перед «Выйти»: сохранённое на телефоне сотрётся.
 * @param {{ app: 'coach' | 'client', open: boolean, busy?: boolean, onCancel: () => void, onConfirm: () => void }} props
 */
export function SignOutWarnDialog({ app, open, busy = false, onCancel, onConfirm }) {
  const titleId = useId()
  const copy = signOutWarnCopy(app)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="modal-overlay modal-overlay--center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => !busy && onCancel()}
    >
      <div className="modal-panel sign-out-warn" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="section-title sign-out-warn__title">
          {copy.title}
        </h2>
        <p className="muted sign-out-warn__body">{copy.body}</p>
        <div className="sign-out-warn__actions">
          <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={onCancel}>
            {copy.cancel}
          </button>
          <button type="button" className="btn btn-touch sign-out-warn__confirm" disabled={busy} onClick={onConfirm}>
            {busy ? '…' : copy.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
