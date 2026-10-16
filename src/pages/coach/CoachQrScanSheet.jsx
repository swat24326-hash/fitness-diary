import { useCallback, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton.jsx'
import { CoachPendingError, redeemCoachHandoff, redeemCoachQr } from '../../lib/coach/coachSession.js'
import { useCoachQrScan } from './useCoachQrScan.js'

/**
 * Сканер QR с планшета. onOk — вошли; onPending — телефон ждёт «Разрешить».
 */
export function CoachQrScanSheet({ onClose, onOk, onPending }) {
  const [busy, setBusy] = useState(false)
  const [redeemError, setRedeemError] = useState('')
  const busyRef = useRef(false)

  const onScan = useCallback(
    ({ kind, token }) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setRedeemError('')
      const redeem = kind === 'handoff' ? redeemCoachHandoff : redeemCoachQr
      redeem(token)
        .then(() => onOk())
        .catch((e) => {
          if (e instanceof CoachPendingError) {
            onPending()
            return
          }
          busyRef.current = false
          setRedeemError(e?.message || 'Не удалось войти')
          setBusy(false)
        })
    },
    [onOk, onPending],
  )

  const { videoRef, error: camError } = useCoachQrScan({ active: !busy && !redeemError, onScan })

  return (
    <div className="client-qr-scan" role="dialog" aria-modal="true" aria-label="Сканер QR для входа тренера">
      <div className="client-qr-scan__chrome">
        <p className="client-qr-scan__title">
          <Camera size={20} aria-hidden /> Наведите на QR с планшета
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
          {redeemError ? (
            <button type="button" className="btn btn-secondary btn-touch client-qr-scan__retry" onClick={() => setRedeemError('')}>
              Сканировать снова
            </button>
          ) : null}
        </p>
      ) : (
        <p className="client-qr-scan__hint muted">На планшете: меню → своё имя → «QR для телефона»</p>
      )}
    </div>
  )
}
