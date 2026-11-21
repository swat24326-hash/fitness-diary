import { useCallback, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton.jsx'
import { useFoodBarcodeFrameScan } from '../../hooks/useFoodBarcodeFrameScan.js'

/**
 * Полноэкранный скан штрихкода продукта (без ручного ввода цифр).
 * @param {{ onClose: () => void, onCode: (digits: string) => void | Promise<void> }} props
 */
export function ClientFoodDiaryBarcodeScanSheet({ onClose, onCode }) {
  const [busy, setBusy] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const busyRef = useRef(false)

  const handleCode = useCallback(
    (digits) => {
      if (busyRef.current) return false
      busyRef.current = true
      setBusy(true)
      setLookupError('')
      Promise.resolve(onCode(digits))
        .then(() => onClose())
        .catch((e) => {
          busyRef.current = false
          setLookupError(e?.message || 'Не удалось найти продукт')
          setBusy(false)
        })
      return true
    },
    [onClose, onCode],
  )

  const { videoRef, error: camError } = useFoodBarcodeFrameScan({
    active: !busy && !lookupError,
    onCode: handleCode,
  })

  return (
    <div
      className="client-qr-scan food-diary-barcode-scan"
      role="dialog"
      aria-modal="true"
      aria-label="Сканер штрихкода"
    >
      <div className="client-qr-scan__chrome">
        <p className="client-qr-scan__title">
          <Camera size={20} aria-hidden /> Наведите на штрихкод
        </p>
        <CloseButton onClick={onClose} touch size={20} disabled={busy} />
      </div>
      <div className="client-qr-scan__frame food-diary-barcode-scan__frame">
        <video ref={videoRef} className="client-qr-scan__video" playsInline muted autoPlay />
        <span className="client-qr-scan__reticle food-diary-barcode-scan__reticle" aria-hidden />
      </div>
      {busy ? <p className="client-qr-scan__status">Ищем продукт…</p> : null}
      {camError || lookupError ? (
        <p className="client-qr-scan__error" role="alert">
          {lookupError || camError}
          {lookupError ? (
            <button
              type="button"
              className="btn btn-secondary btn-touch client-qr-scan__retry"
              onClick={() => setLookupError('')}
            >
              Сканировать снова
            </button>
          ) : null}
        </p>
      ) : (
        <p className="client-qr-scan__hint muted">Держите код в широкой рамке · цифры вводить не нужно</p>
      )}
    </div>
  )
}
