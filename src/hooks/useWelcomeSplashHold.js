import { useEffect, useRef, useState } from 'react'
import {
  WELCOME_SPLASH_MIN_MS,
  WELCOME_SPLASH_MIN_REDUCED_MS,
  welcomeSplashRemainMs,
} from '../lib/welcomeSplashHoldCore.js'

function preferReducedMotion() {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  } catch {
    return false
  }
}

/**
 * Пока busy — показываем splash; после снятия busy держим ещё до минимума,
 * чтобы зум и «Приветствуем» успели отыграть (медленная сеть / быстрый кэш).
 * @param {boolean} busy
 * @returns {boolean} true — ещё показывать AppWelcomeSplash
 */
export function useWelcomeSplashHold(busy) {
  const startedRef = useRef(null)
  const wasBusyRef = useRef(false)
  const [hold, setHold] = useState(Boolean(busy))

  useEffect(() => {
    const minMs = preferReducedMotion() ? WELCOME_SPLASH_MIN_REDUCED_MS : WELCOME_SPLASH_MIN_MS

    if (busy) {
      if (!wasBusyRef.current) startedRef.current = Date.now()
      wasBusyRef.current = true
      setHold(true)
      return undefined
    }

    wasBusyRef.current = false
    const remain = welcomeSplashRemainMs(startedRef.current, Date.now(), minMs)
    if (remain <= 0) {
      startedRef.current = null
      setHold(false)
      return undefined
    }

    setHold(true)
    const t = window.setTimeout(() => {
      startedRef.current = null
      setHold(false)
    }, remain)
    return () => window.clearTimeout(t)
  }, [busy])

  return Boolean(busy) || hold
}
