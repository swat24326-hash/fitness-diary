import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { clientInviteTokenFromScan } from '../../lib/client/clientInviteTokenCore.js'

/**
 * Камера → кадры → jsQR → токен приглашения.
 * @param {{ active: boolean, onToken: (token: string) => void }} opts
 */
export function useClientQrScan({ active, onToken }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
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
    let cancelled = false
    let raf = 0
    foundRef.current = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('На этом телефоне камера в приложении недоступна — откройте ссылку из сообщения клуба')
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
        const canvas = canvasRef.current || document.createElement('canvas')
        canvasRef.current = canvas
        const tick = () => {
          if (cancelled || foundRef.current) return
          if (video.readyState >= 2) {
            const w = video.videoWidth
            const h = video.videoHeight
            if (w && h) {
              canvas.width = w
              canvas.height = h
              const ctx = canvas.getContext('2d', { willReadFrequently: true })
              ctx.drawImage(video, 0, 0, w, h)
              const img = ctx.getImageData(0, 0, w, h)
              const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
              const token = code?.data ? clientInviteTokenFromScan(code.data) : ''
              if (token) {
                foundRef.current = true
                stop()
                onToken(token)
                return
              }
            }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch {
        if (!cancelled) setError('Нет доступа к камере — разрешите её в настройках телефона или откройте ссылку из сообщения')
      }
    }

    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stop()
    }
  }, [active, onToken, stop])

  return { videoRef, error }
}
