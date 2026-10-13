import { useCallback, useEffect, useRef, useState } from 'react'
import { createShakeDetector, isAppleTouchDevice, shakeHintMode, shakeMotionAllowed, sparkWaveAmps } from '../../lib/client/sparkShakeCore.js'

const STORE_KEY = 'fd_client_spark_shake'
const DEMO_STRENGTH = 0.6

function motionAllowed() {
  if (typeof window === 'undefined') return false
  return shakeMotionAllowed({
    hasMotion: 'DeviceMotionEvent' in window,
    coarse: Boolean(window.matchMedia?.('(pointer: coarse)').matches),
    reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    apple: isAppleTouchDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
  })
}

function readStore() {
  try {
    const s = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}')
    return { done: Boolean(s.done), views: Number(s.views) || 0 }
  } catch {
    return { done: false, views: 0 }
  }
}

function writeStore(s) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s))
  } catch {
    /* приватный режим — подсказка вернётся при следующем заходе */
  }
}

/**
 * Потряс телефон — по графику бежит волна (useSparkWave.js). Датчик слушаем, только пока график на экране.
 * Подсказка — когда пришли данные датчика (Android). На iPhone тряски нет (shakeMotionAllowed).
 * paused — идёт «Обновить» (график оседает), тряску не показываем.
 * @returns {{ shake: { n: number, amps: number[] } | null, hint: 'try'|null, onHint: () => void }}
 */
export function useSparkShake(rootRef, count, paused) {
  const [allowed] = useState(motionAllowed)
  const [store, setStore] = useState(() => {
    const s = readStore()
    return { ...s, views: s.views + 1 }
  })
  const [live, setLive] = useState(false)
  const [shake, setShake] = useState(null)
  const pausedRef = useRef(paused)
  const liveRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (allowed) writeStore(store)
  }, [allowed, store])

  const play = useCallback(
    (strength) => {
      setShake((s) => ({ n: (s?.n ?? 0) + 1, amps: sparkWaveAmps(count, strength) }))
      setStore((s) => (s.done ? s : { ...s, done: true }))
    },
    [count],
  )

  useEffect(() => {
    const el = rootRef.current
    if (!allowed || count < 2 || !el || typeof IntersectionObserver === 'undefined') return undefined
    const feed = createShakeDetector()
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity
      if (!a || !Number.isFinite(a.x)) return
      if (!liveRef.current) {
        liveRef.current = true
        setLive(true)
      }
      if (pausedRef.current || document.visibilityState !== 'visible') return
      const strength = feed(a.x, a.y, a.z, e.timeStamp || performance.now())
      if (strength != null) play(strength)
    }
    let listening = false
    const io = new IntersectionObserver(([entry]) => {
      const on = Boolean(entry?.isIntersecting)
      if (on === listening) return
      listening = on
      if (on) window.addEventListener('devicemotion', onMotion)
      else window.removeEventListener('devicemotion', onMotion)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      window.removeEventListener('devicemotion', onMotion)
    }
  }, [rootRef, allowed, count, play])

  const onHint = useCallback(() => play(DEMO_STRENGTH), [play])

  return {
    shake: paused ? null : shake,
    hint: shakeHintMode({ support: allowed && live ? 'open' : 'none', done: store.done, views: store.views }),
    onHint,
  }
}
