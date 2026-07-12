import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * @returns {{ showToast: (text: string, tone?: 'ok' | 'warn' | 'err') => void, toast: { text: string, tone: string } | null }}
 */
export function useAppToast(defaultMs = 3200) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const showToast = useCallback(
    (text, tone = 'ok') => {
      if (!text) return
      if (timerRef.current) clearTimeout(timerRef.current)
      setToast({ text, tone })
      timerRef.current = setTimeout(() => {
        setToast(null)
        timerRef.current = null
      }, defaultMs)
    },
    [defaultMs],
  )

  return { showToast, toast }
}
