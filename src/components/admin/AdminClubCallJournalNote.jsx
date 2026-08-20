import { useEffect, useId, useState } from 'react'
import { Pencil, StickyNote } from 'lucide-react'
import { CLUB_CALL_LOG_STAFF_NOTE_MAX } from '../../lib/admin/clubCallLogCore.js'
import {
  composeClubCallFunnelNote,
  getClubCallFunnelChip,
  isClubCallFunnelNoteReady,
  matchClubCallCallbackHorizon,
  matchClubCallFunnelChip,
  resolveClubCallCallbackOn,
} from '../../lib/admin/clubCallFunnelChipsCore.js'
import { saveClubCallStaffNoteViaApi } from '../../lib/admin/clubCallService.js'
import { notifyCallTodayHomeGlanceChanged } from '../../lib/admin/callTodayHomeGlanceSession.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { ClubCallFunnelNoteFields } from './ClubCallFunnelNoteFields.jsx'

/**
 * Пометка менеджера к строке журнала звонка.
 *
 * @param {{
 *   clubId: string,
 *   logId: string,
 *   note?: string | null,
 *   chipId?: string | null,
 *   callbackOn?: string | null,
 *   onSaved?: (nextNote: string | null, meta?: { chipId: string|null, callbackOn: string|null }) => void,
 *   compact?: boolean,
 * }} props
 */
export function AdminClubCallJournalNote({
  clubId,
  logId,
  note = null,
  chipId: chipIdProp = null,
  callbackOn: callbackOnProp = null,
  onSaved,
  compact = false,
}) {
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(note ?? ''))
  const [chipId, setChipId] = useState(null)
  const [callbackOn, setCallbackOn] = useState(null)
  const [horizonId, setHorizonId] = useState(null)
  const [customDate, setCustomDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [shownNote, setShownNote] = useState(note ?? null)

  const hydrateFromProps = () => {
    const matched = matchClubCallFunnelChip({
      staff_note_chip_id: chipIdProp,
      staff_note: note,
      callback_on: callbackOnProp,
    })
    setChipId(matched.chipId)
    setCallbackOn(matched.callbackOn)
    const asOf = todayLocalIso()
    if (matched.chipId === 'callback_later') {
      const h = matchClubCallCallbackHorizon(matched.callbackOn, asOf)
      setHorizonId(h.horizonId || '1d')
      setCustomDate(h.customDate || '')
    } else {
      setHorizonId(null)
      setCustomDate('')
    }
    setDraft(String(note ?? ''))
  }

  useEffect(() => {
    if (!editing) {
      setShownNote(note ?? null)
      hydrateFromProps()
    }
  }, [note, chipIdProp, callbackOnProp, editing])

  const displayHasNote = Boolean(String(shownNote ?? '').trim())

  const onPickChip = (id) => {
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
      setDraft(composeClubCallFunnelNote({ chipId: id, callbackOn: asOf }) || '')
      return
    }
    const chip = getClubCallFunnelChip(id)
    if (chip?.needsCallbackOn) {
      const d = resolveClubCallCallbackOn(asOf, '1d', '')
      setHorizonId('1d')
      setCustomDate('')
      setCallbackOn(d)
      setDraft(composeClubCallFunnelNote({ chipId: id, callbackOn: d }) || '')
      return
    }
    setCallbackOn(null)
    setHorizonId(null)
    setCustomDate('')
    setDraft(composeClubCallFunnelNote({ chipId: id }) || '')
  }

  const onPickHorizon = (hid) => {
    const asOf = todayLocalIso()
    setHorizonId(hid)
    if (hid === 'custom') {
      setCallbackOn(customDate || null)
      return
    }
    setCustomDate('')
    const d = resolveClubCallCallbackOn(asOf, hid, '')
    setCallbackOn(d)
    setDraft(composeClubCallFunnelNote({ chipId: 'callback_later', callbackOn: d }) || draft)
  }

  const onCustomDateChange = (iso) => {
    setCustomDate(iso)
    setCallbackOn(iso || null)
    if (iso) {
      setDraft(composeClubCallFunnelNote({ chipId: 'callback_later', callbackOn: iso }) || draft)
    }
  }

  const ready = isClubCallFunnelNoteReady({
    chipId,
    callbackOn,
    customText: draft,
  })
  const clearing =
    Boolean(String(shownNote ?? '').trim()) && !chipId && !String(draft).trim()
  const canSave = ready || clearing

  const onSave = async () => {
    if (busy || !clubId || !logId || !canSave) return
    setBusy(true)
    setErr('')
    try {
      const asOf = todayLocalIso()
      const cb =
        chipId === 'callback_today'
          ? asOf
          : getClubCallFunnelChip(chipId)?.needsCallbackOn
            ? callbackOn
            : null
      const data = await saveClubCallStaffNoteViaApi({
        clubId,
        logId,
        staffNote: draft,
        staffNoteChipId: chipId,
        callbackOn: cb,
      })
      const next = data?.log?.staff_note ?? (String(draft).trim() || null)
      const nextChip =
        data?.log?.staff_note_chip_id !== undefined
          ? data.log.staff_note_chip_id
          : next
            ? chipId
            : null
      const nextCb =
        data?.log?.callback_on !== undefined
          ? data.log.callback_on
          : next
            ? cb
            : null
      setShownNote(next)
      onSaved?.(next, { chipId: nextChip, callbackOn: nextCb })
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
      <div
        className={`club-call-note${compact ? ' club-call-note--compact' : ''}${displayHasNote ? ' club-call-note--filled' : ''}`}
      >
        <div className="club-call-note__bar">
          <div className="club-call-note__content">
            {displayHasNote ? (
              <p className="club-call-note__text">{shownNote}</p>
            ) : (
              <p className="muted club-call-note__empty">Без пометки</p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch club-call-note__edit"
            onClick={() => {
              setErr('')
              hydrateFromProps()
              setEditing(true)
            }}
            aria-label={displayHasNote ? 'Изменить пометку' : 'Добавить пометку'}
            title={displayHasNote ? 'Изменить пометку' : 'Добавить пометку'}
          >
            {displayHasNote ? <Pencil size={16} aria-hidden /> : <StickyNote size={16} aria-hidden />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`club-call-note club-call-note--edit${compact ? ' club-call-note--compact' : ''}`}>
      <ClubCallFunnelNoteFields
        fieldId={fieldId}
        compact={compact}
        draft={draft}
        onDraftChange={setDraft}
        chipId={chipId}
        onPickChip={onPickChip}
        callbackOn={callbackOn}
        horizonId={horizonId}
        customDate={customDate}
        onPickHorizon={onPickHorizon}
        onCustomDateChange={onCustomDateChange}
        disabled={busy}
      />
      <div className="club-call-note__footer">
        <span className="club-call-note__meta muted">
          {String(draft).trim().length}/{CLUB_CALL_LOG_STAFF_NOTE_MAX}
        </span>
        <div className="club-call-note__actions">
          <button
            type="button"
            className="btn btn-ghost btn-touch"
            onClick={() => {
              setEditing(false)
              setErr('')
              hydrateFromProps()
            }}
            disabled={busy}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            onClick={() => void onSave()}
            disabled={busy || !canSave}
          >
            {busy ? 'Сохраняем…' : clearing ? 'Очистить' : 'Сохранить'}
          </button>
        </div>
      </div>
      {err ? (
        <p className="club-call-note__error" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}
