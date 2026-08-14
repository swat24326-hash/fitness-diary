import { useEffect, useId, useState } from 'react'
import { CLUB_CALL_LOG_STAFF_NOTE_MAX } from '../../lib/admin/clubCallLogCore.js'
import { saveClubCallStaffNoteViaApi } from '../../lib/admin/clubCallService.js'
import { notifyCallTodayHomeGlanceChanged } from '../../lib/admin/callTodayHomeGlanceSession.js'

/**
 * Пометка менеджера к строке журнала звонка.
 *
 * @param {{
 *   clubId: string,
 *   logId: string,
 *   note?: string | null,
 *   onSaved?: (nextNote: string | null) => void,
 *   compact?: boolean,
 * }} props
 */
export function AdminClubCallJournalNote({
  clubId,
  logId,
  note = null,
  onSaved,
  compact = false,
}) {
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(note ?? ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!editing) setDraft(String(note ?? ''))
  }, [note, editing])

  const hasNote = Boolean(String(note ?? '').trim())

  const onSave = async () => {
    if (busy || !clubId || !logId) return
    setBusy(true)
    setErr('')
    try {
      const data = await saveClubCallStaffNoteViaApi({
        clubId,
        logId,
        staffNote: draft,
      })
      const next = data?.log?.staff_note ?? (String(draft).trim() || null)
      onSaved?.(next)
      notifyCallTodayHomeGlanceChanged(clubId, { source: 'staff_note' })
      setEditing(false)
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className={`club-call-note${compact ? ' club-call-note--compact' : ''}`}>
        {hasNote ? (
          <p className="club-call-note__text">{note}</p>
        ) : (
          <p className="muted club-call-note__empty">Без пометки</p>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-touch club-call-note__edit"
          onClick={() => {
            setErr('')
            setDraft(String(note ?? ''))
            setEditing(true)
          }}
        >
          {hasNote ? 'Изменить' : 'Пометка'}
        </button>
      </div>
    )
  }

  return (
    <div className={`club-call-note club-call-note--edit${compact ? ' club-call-note--compact' : ''}`}>
      <label className="club-call-note__label" htmlFor={fieldId}>
        Пометка к звонку
      </label>
      <textarea
        id={fieldId}
        className="club-call-note__input"
        rows={compact ? 2 : 3}
        maxLength={CLUB_CALL_LOG_STAFF_NOTE_MAX}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Напр.: перезвонить в пятницу · думает про УК"
        disabled={busy}
      />
      <div className="club-call-note__meta muted">
        {String(draft).trim().length}/{CLUB_CALL_LOG_STAFF_NOTE_MAX}
      </div>
      {err ? (
        <p className="club-call-note__error" role="alert">
          {err}
        </p>
      ) : null}
      <div className="club-call-note__actions">
        <button
          type="button"
          className="btn btn-ghost btn-touch"
          onClick={() => {
            setEditing(false)
            setErr('')
            setDraft(String(note ?? ''))
          }}
          disabled={busy}
        >
          Отмена
        </button>
        <button
          type="button"
          className="btn btn-primary btn-touch"
          onClick={() => void onSave()}
          disabled={busy}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
