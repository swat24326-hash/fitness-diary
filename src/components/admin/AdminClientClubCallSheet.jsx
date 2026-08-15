import { useEffect, useId, useState } from 'react'
import { Phone, X } from 'lucide-react'
import { makeClubCallViaApi, saveClubCallStaffNoteViaApi } from '../../lib/admin/clubCallService.js'
import { CLUB_CALL_LOG_STAFF_NOTE_MAX } from '../../lib/admin/clubCallLogCore.js'
import { notifyCallTodayHomeGlanceChanged } from '../../lib/admin/callTodayHomeGlanceSession.js'
import '../../styles/club-call.css'

/**
 * Подтверждение перед исходящим звонком с телефона клуба.
 *
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
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setPhase('confirm')
    setLogId('')
    setNoteDraft('')
    setNoteBusy(false)
    setNoteSaved(false)
  }, [open, client?.id])

  if (!open || !client) return null

  const clubLabel = clubName?.trim() || 'клуба'
  const phone = String(client.phone ?? '').trim() || '—'
  const name = String(client.name ?? '').trim() || 'Клиент'
  const busy = phase === 'calling'

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
      onFeedback?.(
        'Набор на Android клуба — смотрите телефон. Можно сразу оставить пометку.',
        'ok',
        { durationMs: 12_000 },
      )
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Не удалось запустить звонок'
      setError(msg)
      setPhase('confirm')
      onFeedback?.(msg, 'warn')
    }
  }

  const onSaveNote = async () => {
    if (noteBusy || !clubId || !logId) return
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
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось сохранить пометку')
    } finally {
      setNoteBusy(false)
    }
  }

  return (
    <div
      className="club-call-sheet-backdrop"
      role="presentation"
      onClick={() => !busy && !noteBusy && onClose()}
    >
      <div
        className="club-call-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="club-call-sheet__head">
          <div>
            <h2 id={titleId} className="club-call-sheet__title">
              {phase === 'launched'
                ? 'Смотрите на телефон клуба'
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
          <div className="club-call-sheet__launched" role="status">
            <p className="club-call-sheet__launched-lead">
              <Phone size={18} aria-hidden />
              Набор на телефоне клуба.
            </p>
            <ul className="club-call-sheet__launched-list">
              <li>На Android клуба должен начаться исходящий набор на этот номер.</li>
              <li>
                Короткая зелёная полоска сверху списка — только сообщение в приложении (~12 с), не
                обрыв звонка.
              </li>
            </ul>
            {logId && !noteSaved ? (
              <div className="club-call-sheet__note">
                <label className="club-call-note__label" htmlFor={noteId}>
                  Пометка к звонку (необязательно)
                </label>
                <textarea
                  id={noteId}
                  className="club-call-note__input"
                  rows={2}
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
            Звонок пойдёт с Android клуба через Мои Звонки. Телефон должен быть онлайн (интернет),
            приложение не убито энергосбережением. Email в настройках Мои Звонки — тот же, под
            которым вошли в приложении на телефоне.
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
              {logId && !noteSaved ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-touch"
                  onClick={() => void onSaveNote()}
                  disabled={noteBusy || !String(noteDraft).trim()}
                >
                  {noteBusy ? 'Сохраняем…' : 'Сохранить пометку'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary btn-touch"
                onClick={() => onClose()}
                disabled={noteBusy}
              >
                {noteSaved ? 'Готово' : 'Понятно'}
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
    </div>
  )
}
