/**
 * Лист клубного звонка: подтверждение → набор → пометка воронки (без инфо-простыни).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { makeClubCallViaApi, saveClubCallStaffNoteViaApi } from '../../lib/admin/clubCallService.js'
import { CLUB_CALL_LOG_STAFF_NOTE_MAX } from '../../lib/admin/clubCallLogCore.js'
import {
  composeClubCallFunnelNote,
  getClubCallFunnelChip,
  isClubCallFunnelNoteReady,
  resolveClubCallCallbackOn,
} from '../../lib/admin/clubCallFunnelChipsCore.js'
import { notifyCallTodayHomeGlanceChanged } from '../../lib/admin/callTodayHomeGlanceSession.js'
import { acquireClubCallOverlayScrollLock } from '../../lib/admin/clubCallOverlayScrollLock.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { ClubCallFunnelNoteFields } from './ClubCallFunnelNoteFields.jsx'
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
  /** @type {['confirm' | 'calling' | 'launched', function]} */
  const [phase, setPhase] = useState('confirm')
  const [error, setError] = useState('')
  const [logId, setLogId] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [chipId, setChipId] = useState(/** @type {string | null} */ (null))
  const [callbackOn, setCallbackOn] = useState(/** @type {string | null} */ (null))
  const [horizonId, setHorizonId] = useState(/** @type {string | null} */ (null))
  const [customDate, setCustomDate] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const resetNoteState = () => {
    setNoteDraft('')
    setChipId(null)
    setCallbackOn(null)
    setHorizonId(null)
    setCustomDate('')
    setNoteBusy(false)
    setNoteSaved(false)
  }

  useEffect(() => {
    if (!open) return
    setError('')
    setPhase('confirm')
    setLogId('')
    resetNoteState()
  }, [open, client?.id])

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
  const noteReady = isClubCallFunnelNoteReady({
    chipId,
    callbackOn,
    customText: noteDraft,
  })

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

  const onPickChip = (id) => {
    if (noteBusy || noteSaved) return
    const asOf = todayLocalIso()
    setChipId(id)
    if (!id) {
      setCallbackOn(null)
      setHorizonId(null)
      setCustomDate('')
      return
    }
    if (id === 'callback_today') {
      setCallbackOn(asOf)
      setHorizonId(null)
      setCustomDate('')
      setNoteDraft(composeClubCallFunnelNote({ chipId: id, callbackOn: asOf }) || '')
      return
    }
    const chip = getClubCallFunnelChip(id)
    if (chip?.needsCallbackOn) {
      const d = resolveClubCallCallbackOn(asOf, '1d', '')
      setHorizonId('1d')
      setCustomDate('')
      setCallbackOn(d)
      setNoteDraft(composeClubCallFunnelNote({ chipId: id, callbackOn: d }) || '')
      return
    }
    setCallbackOn(null)
    setHorizonId(null)
    setCustomDate('')
    setNoteDraft(composeClubCallFunnelNote({ chipId: id }) || '')
  }

  const onPickHorizon = (hid) => {
    if (noteBusy || noteSaved) return
    const asOf = todayLocalIso()
    setHorizonId(hid)
    if (hid === 'custom') {
      setCallbackOn(customDate || null)
      return
    }
    setCustomDate('')
    const d = resolveClubCallCallbackOn(asOf, hid, '')
    setCallbackOn(d)
    setNoteDraft(composeClubCallFunnelNote({ chipId: 'callback_later', callbackOn: d }) || noteDraft)
  }

  const onCustomDateChange = (iso) => {
    if (noteBusy || noteSaved) return
    setCustomDate(iso)
    setCallbackOn(iso || null)
    if (iso) {
      setNoteDraft(composeClubCallFunnelNote({ chipId: 'callback_later', callbackOn: iso }) || noteDraft)
    }
  }

  const onSaveNote = async ({ closeAfter = false } = {}) => {
    if (noteBusy || !clubId || !logId) return
    if (!noteReady) {
      if (closeAfter && !String(noteDraft).trim() && !chipId) onClose()
      return
    }
    setNoteBusy(true)
    setError('')
    try {
      const asOf = todayLocalIso()
      const cb =
        chipId === 'callback_today'
          ? asOf
          : getClubCallFunnelChip(chipId)?.needsCallbackOn
            ? callbackOn
            : null
      await saveClubCallStaffNoteViaApi({
        clubId,
        logId,
        staffNote: noteDraft,
        staffNoteChipId: chipId,
        callbackOn: cb,
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
                ? 'Набор на телефоне клуба. Отметьте следующий шаг воронки — в журнал лезть не нужно.'
                : 'Команда ушла на телефон клуба. Строка журнала не пришла — пометку добавьте позже в истории звонков.'}
            </p>
            {canNote ? (
              <div className="club-call-sheet__note">
                <ClubCallFunnelNoteFields
                  fieldId={noteId}
                  draft={noteDraft}
                  onDraftChange={setNoteDraft}
                  chipId={chipId}
                  onPickChip={onPickChip}
                  callbackOn={callbackOn}
                  horizonId={horizonId}
                  customDate={customDate}
                  onPickHorizon={onPickHorizon}
                  onCustomDateChange={onCustomDateChange}
                  disabled={noteBusy}
                />
                <p className="muted club-call-sheet__note-meta">
                  {String(noteDraft).trim().length}/{CLUB_CALL_LOG_STAFF_NOTE_MAX}
                </p>
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
                  disabled={noteBusy || !noteReady}
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
