import { useCallback, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton.jsx'
import { CLIENT_OFFLINE_RU, redeemClientInvite } from '../../lib/client/clientSession.js'
import { useClientQrScan } from './useClientQrScan.js'

/**
 * Полноэкранный сканер QR входа клиента. onOk — после успешного redeem (сессия уже сохранена).
 */
export function ClientQrScanSheet({ onClose, onOk }) {
  const [busy, setBusy] = useState(false)
  const [redeemError, setRedeemError] = useState('')
  const busyRef = useRef(false)

  const onToken = useCallback(
    (token) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setRedeemError('')
      redeemClientInvite(token)
        .then(() => onOk())
        .catch((e) => {
          busyRef.current = false
          setRedeemError(e?.message || 'Не удалось войти')
          setBusy(false)
        })
    },
    [onOk],
  )

  const { videoRef, error: camError } = useClientQrScan({ active: !busy && !redeemError, onToken })

  return (
    <div className="client-qr-scan" role="dialog" aria-modal="true" aria-label="Сканер QR для входа">
      <div className="client-qr-scan__chrome">
        <p className="client-qr-scan__title">
          <Camera size={20} aria-hidden /> Наведите на QR из клуба
        </p>
        <CloseButton onClick={onClose} touch size={20} disabled={busy} />
      </div>
      <div className="client-qr-scan__frame">
        <video ref={videoRef} className="client-qr-scan__video" playsInline muted autoPlay />
        <span className="client-qr-scan__reticle" aria-hidden />
      </div>
      {busy ? <p className="client-qr-scan__status">Входим…</p> : null}
      {camError || redeemError ? (
        <p className="client-qr-scan__error" role="alert">
          {redeemError || camError}
          {redeemError && redeemError !== CLIENT_OFFLINE_RU ? (
            <button type="button" className="btn btn-secondary btn-touch client-qr-scan__retry" onClick={() => setRedeemError('')}>
              Сканировать снова
            </button>
          ) : null}
        </p>
      ) : (
        <p className="client-qr-scan__hint muted">QR в карточке клиента у тренера или администратора</p>
      )}
    </div>
  )
}
