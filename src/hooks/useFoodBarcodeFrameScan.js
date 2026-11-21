import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FOOD_BARCODE_SCAN_FORMATS,
  foodBarcodeScanSupported,
} from '../lib/client/foodDiaryBarcodeScanCore.js'
import { normalizeFoodBarcode } from '../lib/client/foodDiaryCatalogCore.js'

/**
 * Камера → BarcodeDetector → нормализованный штрихкод (цифры 8–14).
 * @param {{ active: boolean, onCode: (digits: string) => void | false }} opts
 */
export function useFoodBarcodeFrameScan({ active, onCode }) {
  const videoRef = useRef(null)
  const [error, setError] = useState('')
  const foundRef = useRef(false)

  const stop = useCallback(() => {
    const v = videoRef.current
    const stream = v?.srcObject
    if (stream && typeof stream.getTracks === 'function') {
      for (const t of stream.getTracks()) t.stop()
    }
    if (v) v.srcObject = null
  }, [])

  useEffect(() => {
    if (!active) {
      stop()
      foundRef.current = false
      setError('')
      return undefined
    }

    if (!foodBarcodeScanSupported()) {
      setError('Сканер штрихкода на этом телефоне недоступен — найдите продукт по названию')
      return undefined
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Камера недоступна — разрешите её в настройках или найдите продукт по названию')
      return undefined
    }

    let cancelled = false
    let raf = 0
    let detector = null
    foundRef.current = false

    async function start() {
      try {
        detector = new BarcodeDetector({ formats: FOOD_BARCODE_SCAN_FORMATS })
      } catch {
        if (!cancelled) {
          setError('Сканер штрихкода недоступен — найдите продукт по названию')
        }
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        })
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop()
          return
        }
        const video = videoRef.current
        if (!video) {
          for (const t of stream.getTracks()) t.stop()
          return
        }
        video.srcObject = stream
        await video.play()

        const tick = async () => {
          if (cancelled || foundRef.current) return
          if (video.readyState >= 2) {
            try {
              const codes = await detector.detect(video)
              const digits = normalizeFoodBarcode(codes?.[0]?.rawValue)
              if (digits && onCode(digits) !== false) {
                foundRef.current = true
                stop()
                return
              }
            } catch {
              /* кадр пропущен */
            }
          }
          raf = requestAnimationFrame(() => {
            void tick()
          })
        }
        raf = requestAnimationFrame(() => {
          void tick()
        })
      } catch {
        if (!cancelled) {
          setError('Нет доступа к камере — разрешите её в настройках телефона')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stop()
    }
  }, [active, onCode, stop])

  return { videoRef, error }
}
