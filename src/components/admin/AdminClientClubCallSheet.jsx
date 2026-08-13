import { useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'
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
 *   onFeedback?: (msg: string, tone?: string) => void,
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
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setCalling(false)
  }, [open, client?.id])

  if (!open || !client) return null

  const clubLabel = clubName?.trim() || 'клуба'
  const phone = String(client.phone ?? '').trim() || '—'
  const name = String(client.name ?? '').trim() || 'Клиент'

  const onConfirm = async () => {
    if (calling || !clubId || !client.id) return
    setCalling(true)
    setError('')
    try {
      await makeClubCallViaApi({ clubId, clientId: client.id })
      onFeedback?.('Звонок запущен с телефона клуба', 'ok')
      onCalled?.(client.id)
      onClose()
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Не удалось запустить звонок'
      setError(msg)
      onFeedback?.(msg, 'warn')
    } finally {
      setCalling(false)
    }
  }

  return (
    <div
      className="club-call-sheet-backdrop"
      role="presentation"
      onClick={() => !calling && onClose()}
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
              Позвонить с телефона {clubLabel}?
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
            onClick={() => !calling && onClose()}
            disabled={calling}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="club-call-sheet__hint">
          Звонок пойдёт с Android клуба через Мои Звонки. Телефон должен быть онлайн (интернет),
          приложение не убито энергосбережением. Email в настройках Мои Звонки — тот же, под которым
          вошли в приложении на телефоне.
        </p>

        {error ? (
          <p className="club-call-sheet__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="club-call-sheet__actions">
          <button
            type="button"
            className="btn btn-ghost btn-touch"
            onClick={() => !calling && onClose()}
            disabled={calling}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary btn-touch"
            onClick={() => void onConfirm()}
            disabled={calling}
          >
            {calling ? 'Звоним…' : 'Позвонить'}
          </button>
        </div>
      </div>
    </div>
  )
}
