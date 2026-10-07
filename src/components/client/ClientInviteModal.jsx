import { useEffect, useId, useState } from 'react'
import { Copy, QrCode, RefreshCw } from 'lucide-react'
import { ModalHeader } from '../ModalHeader.jsx'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { createClientInvite, revokeClientAppAccess } from '../../lib/client/clientInviteService.js'

async function qrDataUrl(text) {
  const { default: qrcode } = await import('qrcode-generator')
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createDataURL(8, 4)
}

/**
 * QR и ссылка для входа клиента в /me. Ссылка одноразовая, живёт 72 часа;
 * новая ссылка гасит прежнюю неиспользованную.
 * @param {{ open: boolean, client: { id: string, name?: string }, onClose: () => void }} props
 */
export function ClientInviteModal({ open, client, onClose }) {
  const titleId = useId()
  const [invite, setInvite] = useState(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const issue = async () => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const next = await createClientInvite(client.id)
      setInvite(next)
      setQr(await qrDataUrl(next.url))
    } catch (e) {
      setInvite(null)
      setQr('')
      setError(e?.message || 'Не удалось создать ссылку')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setInvite(null)
      setQr('')
      setNote('')
      setError('')
      return
    }
    void issue()
  }, [open, client?.id])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url)
      setNote('Ссылка скопирована — отправьте её клиенту в мессенджер')
    } catch {
      setNote('Не удалось скопировать — пусть клиент отсканирует QR')
    }
  }

  const revokeAll = async () => {
    if (!window.confirm('Отключить приложение на всех телефонах клиента? Войти снова можно будет только по новой ссылке.')) return
    setBusy(true)
    setError('')
    try {
      await revokeClientAppAccess(client.id)
      setInvite(null)
      setQr('')
      setNote('Все входы отключены')
    } catch (e) {
      setError(e?.message || 'Не удалось отключить входы')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={() => !busy && onClose()}>
      <div className="modal-panel client-invite-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader titleId={titleId} title="Приложение клиента" onClose={onClose} closeDisabled={busy} />
        <p className="muted client-invite-modal__lead">
          {client?.name ? `${client.name}: ` : ''}пусть клиент наведёт камеру на код.
        </p>
        <div className="client-invite-modal__qr" aria-busy={busy}>
          {qr ? (
            <img className="client-invite-modal__qr-img" src={qr} alt="QR-код для входа клиента" />
          ) : busy ? (
            <p className="muted" role="status">Создаю ссылку…</p>
          ) : (
            <QrCode size={64} aria-hidden className="client-invite-modal__qr-empty" />
          )}
        </div>
        {invite ? (
          <p className="muted client-invite-modal__exp">
            Одноразовая, действует до {formatDateTimeRu(invite.expiresAt)}
          </p>
        ) : null}
        {error ? <p className="client-invite-modal__error" role="alert">{error}</p> : null}
        {note ? <p className="client-invite-modal__note" role="status">{note}</p> : null}
        <div className="row td-modal-actions client-invite-modal__actions">
          <button type="button" className="btn btn-ghost btn-touch client-invite-modal__revoke" disabled={busy} onClick={() => void revokeAll()}>
            Отключить все входы
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            disabled={busy}
            onClick={() => void issue()}
            title="Новая ссылка (старая перестанет работать)"
            aria-label="Новая ссылка"
          >
            <RefreshCw size={18} aria-hidden />
          </button>
          <button type="button" className="btn btn-primary btn-touch" disabled={busy || !invite} onClick={() => void copy()}>
            <Copy size={16} aria-hidden />
            Скопировать ссылку
          </button>
        </div>
      </div>
    </div>
  )
}
