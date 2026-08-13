import { useEffect, useId, useState } from 'react'
import { Phone, X } from 'lucide-react'
import { makeClubCallViaApi } from '../../lib/admin/clubCallService.js'
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
}) {
  const titleId = useId()
  /** @type {['confirm' | 'calling' | 'launched', function]} */
  const [phase, setPhase] = useState('confirm')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setPhase('confirm')
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
      await makeClubCallViaApi({ clubId, clientId: client.id })
      setPhase('launched')
      onCalled?.(client.id)
      onFeedback?.(
        'Команда ушла на Android клуба — смотрите набор на телефоне. Зелёная полоска на экране не означает конец звонка.',
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

  return (
    <div
      className="club-call-sheet-backdrop"
      role="presentation"
      onClick={() => !busy && onClose()}
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
            onClick={() => !busy && onClose()}
            disabled={busy}
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
              Команда отправлена в Мои Звонки.
            </p>
            <ul className="club-call-sheet__launched-list">
              <li>На Android клуба должен начаться исходящий набор на этот номер.</li>
              <li>
                Короткая зелёная полоска сверху списка — только сообщение в приложении (~12 с), не
                обрыв звонка.
              </li>
              <li>
                Если на телефоне «пропущенный» на 1–2 сек: не звоните на тот же номер, что SIM
                клуба; проверьте интернет и энергосбережение приложения Мои Звонки.
              </li>
            </ul>
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
            <button type="button" className="btn btn-primary btn-touch" onClick={() => onClose()}>
              Понятно
            </button>
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
