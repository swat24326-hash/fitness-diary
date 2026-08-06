/**
 * Модалка: админ меняет ФИО тренера (Организация).
 */

/**
 * @param {{
 *   trainer: { id?: string, name?: string | null, login?: string | null } | null,
 *   nameValue: string,
 *   busy?: boolean,
 *   error?: string,
 *   onNameChange: (value: string) => void,
 *   onClose: () => void,
 *   onSubmit: (e: import('react').FormEvent) => void,
 * }} props
 */
export function AdminTrainerNameEditModal({
  trainer,
  nameValue,
  busy = false,
  error = '',
  onNameChange,
  onClose,
  onSubmit,
}) {
  if (!trainer?.id) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-edit-trainer-name-title"
      onClick={onClose}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h2 id="org-edit-trainer-name-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
          Изменить ФИО
        </h2>
        <p className="muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
          Логин <strong>{trainer.login ?? '—'}</strong> не меняется. На планшете новое имя появится после
          обновления сессии (Sync или повторный вход).
        </p>
        <form className="grid td-modal-form" onSubmit={onSubmit} style={{ gap: 12 }}>
          <div className="field">
            <label className="label" htmlFor="org-edit-trainer-name">
              ФИО
            </label>
            <input
              id="org-edit-trainer-name"
              type="text"
              className="input"
              autoComplete="name"
              value={nameValue}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={busy}
              required
              maxLength={120}
              autoFocus
            />
          </div>
          {error ? (
            <p className="muted" style={{ color: 'var(--danger, #f87171)', margin: 0 }}>
              {error}
            </p>
          ) : null}
          <div className="row td-modal-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary btn-touch" disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
