import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { QrCode, RefreshCw } from 'lucide-react'
import { ModalHeader } from '../ModalHeader.jsx'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { createCoachPhoneInvite } from '../../lib/coach/coachInviteService.js'
import { qrDataUrl } from '../../lib/qrDataUrl.js'

/**
 * QR для входа в приложение тренера на своём телефоне. Ссылки нет — только код на экране:
 * одноразовый, 10 минут; телефон после сканирования ждёт «Разрешить» админа.
 * Портал в body: внутри анимированных карточек и шапки position:fixed запирается в их рамке.
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function CoachPhoneQrModal({ open, onClose }) {
  const titleId = useId()
  const [invite, setInvite] = useState(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const issue = async () => {
    setBusy(true)
    setError('')
    try {
      const next = await createCoachPhoneInvite()
      setInvite(next)
      setQr(await qrDataUrl(next.url))
    } catch (e) {
      setInvite(null)
      setQr('')
      setError(e?.message || 'Не удалось создать QR')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setInvite(null)
      setQr('')
      setError('')
      return
    }
    void issue()
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={() => !busy && onClose()}>
      <div className="modal-panel client-invite-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader titleId={titleId} title="Приложение на телефоне" onClose={onClose} closeDisabled={busy} />
        <p className="muted client-invite-modal__lead">
          Наведите камеру своего телефона на код. Откроется приложение тренера — телефон войдёт после «Разрешить» администратора.
        </p>
        <div className="client-invite-modal__qr" aria-busy={busy}>
          {qr ? (
            <img className="client-invite-modal__qr-img" src={qr} alt="QR-код для входа с телефона" />
          ) : busy ? (
            <p className="muted" role="status">Создаю код…</p>
          ) : (
            <QrCode size={64} aria-hidden className="client-invite-modal__qr-empty" />
          )}
        </div>
        {invite ? (
          <p className="muted client-invite-modal__exp">Одноразовый, действует до {formatDateTimeRu(invite.expiresAt)}</p>
        ) : null}
        {error ? <p className="client-invite-modal__error" role="alert">{error}</p> : null}
        <div className="row td-modal-actions client-invite-modal__actions">
          <button type="button" className="btn btn-secondary btn-touch" disabled={busy} onClick={() => void issue()}>
            <RefreshCw size={16} aria-hidden />
            Новый код
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
