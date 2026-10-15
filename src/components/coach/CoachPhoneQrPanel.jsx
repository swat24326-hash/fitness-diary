import { useEffect, useRef, useState } from 'react'
import { QrCode, RefreshCw } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { createCoachPhoneInvite } from '../../lib/coach/coachInviteService.js'
import { qrDataUrl } from '../../lib/qrDataUrl.js'

/**
 * QR для входа в приложение тренера на своём телефоне — прямо в «Мой профиль». Ссылки нет — только код на экране:
 * одноразовый, 10 минут; первый телефон тренера входит сразу, следующий ждёт «Разрешить» админа. Код берём при показе.
 */
export function CoachPhoneQrPanel() {
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

  const issued = useRef(false)
  useEffect(() => {
    if (issued.current) return
    issued.current = true
    void issue()
  }, [])

  return (
    <div className="coach-qr-panel" data-testid="coach-phone-qr">
      <p className="muted client-invite-modal__lead">
        Наведите камеру своего телефона на код. Откроется приложение тренера: первый телефон входит сразу, новый вместо прежнего —
        после «Разрешить» администратора.
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
      {invite ? <p className="muted client-invite-modal__exp">Одноразовый, действует до {formatDateTimeRu(invite.expiresAt)}</p> : null}
      {error ? (
        <p className="client-invite-modal__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-secondary btn-touch" disabled={busy} onClick={() => void issue()}>
        <RefreshCw size={16} aria-hidden />
        Новый код
      </button>
    </div>
  )
}
