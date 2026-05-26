import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  clearAppErrors,
  formatAppErrorTime,
  getAppErrors,
  sourceLabel,
} from '../lib/appErrorJournal'

export function AppErrorJournalModal({ open, onClose, onCleared }) {
  const errors = open ? getAppErrors(50) : []

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleClear = () => {
    clearAppErrors()
    onCleared?.()
    onClose()
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-error-journal-title"
      onClick={onClose}
    >
      <div className="modal-panel app-error-journal" onClick={(e) => e.stopPropagation()}>
        <div className="app-error-journal__head">
          <AlertTriangle size={22} className="app-error-journal__icon" aria-hidden />
          <div>
            <h3 id="app-error-journal-title" style={{ margin: 0 }}>
              Журнал ошибок
            </h3>
            <p className="muted app-error-journal__sub">
              Синхронизация, сеть, вход и другие сбои на этом устройстве
            </p>
          </div>
        </div>

        {errors.length === 0 ? (
          <p className="app-error-journal__empty">Ошибок нет — журнал пуст.</p>
        ) : (
          <ul className="app-error-journal__list">
            {errors.map((row, i) => (
              <li key={`${row.at}-${i}`} className="app-error-journal__item">
                <div className="app-error-journal__meta">
                  <span className={`app-error-journal__tag app-error-journal__tag--${row.source}`}>
                    {sourceLabel(row.source)}
                  </span>
                  {row.status != null ? (
                    <span className="app-error-journal__status">HTTP {row.status}</span>
                  ) : null}
                  <time className="app-error-journal__time">{formatAppErrorTime(row.at)}</time>
                </div>
                {row.context ? <div className="app-error-journal__ctx">{row.context}</div> : null}
                <div className="app-error-journal__msg">{row.error}</div>
                {row.detail ? <div className="app-error-journal__detail">{row.detail}</div> : null}
              </li>
            ))}
          </ul>
        )}

        <div className="row app-error-journal__actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn btn-ghost app-error-journal__clear"
            disabled={errors.length === 0}
            onClick={handleClear}
          >
            Очистить журнал
          </button>
        </div>
      </div>
    </div>
  )
}
