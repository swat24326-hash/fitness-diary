/**
 * Лист клубного звонка: подтверждение → набор → пометка (без инфо-простыни).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { makeClubCallViaApi, saveClubCallStaffNoteViaApi } from '../../lib/admin/clubCallService.js'
import { CLUB_CALL_LOG_STAFF_NOTE_MAX } from '../../lib/admin/clubCallLogCore.js'
import {
  CLUB_CALL_SHEET_NOTE_CHIPS,
  clubCallSheetNoteFromChip,
} from '../../lib/admin/clubCallSheetNoteChipsCore.js'
import { notifyCallTodayHomeGlanceChanged } from '../../lib/admin/callTodayHomeGlanceSession.js'
import { acquireClubCallOverlayScrollLock } from '../../lib/admin/clubCallOverlayScrollLock.js'
import '../../styles/club-call.css'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null },
 *   clubName?: string,
 *   onFeedback?: (msg: string, tone?: string, opts?: { durationMs?: number }) => void,
 *   onCalled?: (clientId: string) => void,
 *   onNoteSaved?: () => void,
 * }} props
 */
export function AdminClientClubCallSheet({
  open,
  onClose,
  clubId,
  client,
  clubName = '',
  onFeedback,
  onCalled,
  onNoteSaved,
}) {
  const titleId = useId()
  const noteId = useId()
  const noteRef = useRef(/** @type {HTMLTextAreaElement | null} */ (null))
  /** @type {['confirm' | 'calling' | 'launched', function]} */
  const [phase, setPhase] = useState('confirm')
  const [error, setError] = useState('')
  const [logId, setLogId] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    setError('')
    setPhase('confirm')
    setLogId('')
    setNoteDraft('')
    setNoteBusy(false)
    setNoteSaved(false)
  }, [open, client?.id])

  useEffect(() => {
    if (!open || phase !== 'launched' || !logId || noteSaved) return
    const t = window.setTimeout(() => {
      noteRef.current?.focus?.()
    }, 80)
    return () => window.clearTimeout(t)
  }, [open, phase, logId, noteSaved])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      if (phase === 'calling' || noteBusy) return
      onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey, true)
    const release = acquireClubCallOverlayScrollLock()
    return () => {
      window.removeEventListener('keydown', onKey, true)
      release()
    }
  }, [open, phase, noteBusy])

  if (!open || !client || typeof document === 'undefined') return null

  const clubLabel = clubName?.trim() || 'клуба'
  const phone = String(client.phone ?? '').trim() || '—'
  const name = String(client.name ?? '').trim() || 'Клиент'
  const busy = phase === 'calling'
  const canNote = Boolean(logId) && !noteSaved
  const noteTrim = String(noteDraft).trim()

  const onConfirm = async () => {
    if (busy || phase === 'launched' || !clubId || !client.id) return
    setPhase('calling')
    setError('')
    try {
      const data = await makeClubCallViaApi({ clubId, clientId: client.id })
      setLogId(data?.log_id ? String(data.log_id) : '')
      setPhase('launched')
      onCalled?.(client.id)
      notifyCallTodayHomeGlanceChanged(clubId, { source: 'call_launched' })
      onFeedback?.('Набор на телефоне клуба', 'ok', { durationMs: 5000 })
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Не удалось запустить звонок'
      setError(msg)
      setPhase('confirm')
      onFeedback?.(msg, 'warn')
    }
  }

  const onSaveNote = async ({ closeAfter = false } = {}) => {
    if (noteBusy || !clubId || !logId) return
    if (!noteTrim) {
      if (closeAfter) onClose()
      return
    }
    setNoteBusy(true)
    setError('')
    try {
      await saveClubCallStaffNoteViaApi({
        clubId,
        logId,
        staffNote: noteDraft,
      })
      setNoteSaved(true)
      notifyCallTodayHomeGlanceChanged(clubId, { source: 'call_sheet_note' })
      onNoteSaved?.()
      onFeedback?.('Пометка сохранена', 'ok')
      if (closeAfter) onClose()
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось сохранить пометку')
    } finally {
      setNoteBusy(false)
    }
  }

  const onPickChip = (chipNote) => {
    if (noteBusy || noteSaved) return
    setNoteDraft(clubCallSheetNoteFromChip(chipNote, CLUB_CALL_LOG_STAFF_NOTE_MAX))
  }

  return createPortal(
    <div
      className="club-call-sheet-backdrop"
      role="presentation"
      onClick={() => !busy && !noteBusy && onClose()}
    >
      <div
        className={`club-call-sheet${phase === 'launched' ? ' club-call-sheet--note' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="club-call-sheet__head">
          <div>
            <h2 id={titleId} className="club-call-sheet__title">
              {phase === 'launched'
                ? canNote || noteSaved
                  ? 'Пометка к звонку'
                  : 'Звонок запущен'
                : `Позвонить с телефона ${clubLabel}?`}
            </h2>
            <p className="club-call-sheet__meta">
              {name}
              {' · '}
              {phone}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            onClick={() => !busy && !noteBusy && onClose()}
            disabled={busy || noteBusy}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {phase === 'launched' ? (
          <div className="club-call-sheet__launched club-call-sheet__launched--note" role="status">
            <p className="club-call-sheet__status">
              {logId
                ? 'Набор на телефоне клуба. Пишите пометку во время разговора или сразу после — в журнал лезть не нужно.'
                : 'Команда ушла на телефон клуба. Строка журнала не пришла — пометку добавьте позже в истории звонков.'}
            </p>
            {canNote ? (
              <div className="club-call-sheet__note">
                <label className="club-call-note__label" htmlFor={noteId}>
                  Что важно запомнить
                </label>
                <div className="club-call-sheet__chips" role="group" aria-label="Быстрые пометки">
                  {CLUB_CALL_SHEET_NOTE_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="club-call-sheet__chip"
                      disabled={noteBusy}
                      onClick={() => onPickChip(chip.note)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={noteRef}
                  id={noteId}
                  className="club-call-note__input club-call-sheet__note-input"
                  rows={3}
                  maxLength={CLUB_CALL_LOG_STAFF_NOTE_MAX}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Напр.: перезвонить в пятницу · думает про УК"
                  disabled={noteBusy}
                />
              </div>
            ) : null}
            {noteSaved ? (
              <p className="muted club-call-sheet__note-ok">Пометка сохранена в истории клиента.</p>
            ) : null}
          </div>
        ) : (
          <p className="club-call-sheet__hint">
            Звонок пойдёт с Android клуба (Мои Звонки). Телефон онлайн, приложение не убито
            энергосбережением.
          </p>
        )}

        {error ? (
          <p className="club-call-sheet__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="club-call-sheet__actions">
          {phase === 'launched' ? (
            <>
              {canNote ? (
                <button
                  type="button"
                  className="btn btn-primary btn-touch"
                  onClick={() => void onSaveNote({ closeAfter: true })}
                  disabled={noteBusy || !noteTrim}
                >
                  {noteBusy ? 'Сохраняем…' : 'Сохранить и закрыть'}
                </button>
              ) : null}
              <button
                type="button"
                className={`btn btn-touch${canNote ? ' btn-ghost' : ' btn-primary'}`}
                onClick={() => onClose()}
                disabled={noteBusy}
              >
                {noteSaved ? 'Готово' : canNote ? 'Закрыть без пометки' : 'Закрыть'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => !busy && onClose()}
                disabled={busy}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary btn-touch"
                onClick={() => void onConfirm()}
                disabled={busy}
              >
                {busy ? 'Звоним…' : 'Позвонить'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
