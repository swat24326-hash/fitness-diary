import { useCallback, useEffect, useRef, useState } from 'react'
import { createShakeDetector, shakeHintMode, sparkWaveAmps } from '../../lib/client/sparkShakeCore.js'

const STORE_KEY = 'fd_client_spark_shake'
const DEMO_STRENGTH = 0.6

/** Компьютер и «уменьшение движения» в телефоне — тряски нет совсем. */
function motionAllowed() {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return false
  if (!window.matchMedia?.('(pointer: coarse)').matches) return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const canAsk = () => typeof window.DeviceMotionEvent?.requestPermission === 'function'

function readStore() {
  try {
    const s = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}')
    return { done: Boolean(s.done), granted: Boolean(s.granted), views: Number(s.views) || 0 }
  } catch {
    return { done: false, granted: false, views: 0 }
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
 * Пришли данные датчика — работает сразу (Android). Данных нет, но можно спросить разрешение — кнопка (iPhone).
 * paused — идёт «Обновить» (график оседает), тряску не показываем.
 * @returns {{ shake: { n: number, amps: number[] } | null, hint: 'ask'|'try'|null, onHint: () => void, onPlotTouch: () => void }}
 */
export function useSparkShake(rootRef, count, paused) {
  const [allowed] = useState(motionAllowed)
  const [store, setStore] = useState(() => {
    const s = readStore()
    return { ...s, views: s.views + 1 }
  })
  const [live, setLive] = useState(false)
  const [grants, setGrants] = useState(0)
  const [shake, setShake] = useState(null)
  const pausedRef = useRef(paused)
  const liveRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (allowed) writeStore(store)
  }, [allowed, store])

  const markDone = useCallback((patch = {}) => setStore((s) => (s.done && !patch.granted ? s : { ...s, ...patch, done: true })), [])

  const play = useCallback(
    (strength) => {
      setShake((s) => ({ n: (s?.n ?? 0) + 1, amps: sparkWaveAmps(count, strength) }))
      markDone()
    },
    [count, markDone],
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
  }, [rootRef, allowed, count, play, grants])

  const askPermission = useCallback(async () => {
    try {
      return (await window.DeviceMotionEvent.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }, [])

  const support = !allowed ? 'none' : live ? 'open' : canAsk() ? 'ask' : 'none'

  const onHint = useCallback(async () => {
    if (support !== 'ask') {
      play(DEMO_STRENGTH)
      return
    }
    const ok = await askPermission()
    if (ok) {
      setGrants((n) => n + 1)
      markDone({ granted: true })
      play(DEMO_STRENGTH)
    } else {
      markDone({ granted: false })
    }
  }, [support, askPermission, markDone, play])

  /* iPhone помнит разрешение не дольше сессии Safari: раньше разрешал — тихо включаем по первому касанию графика. */
  const onPlotTouch = useCallback(() => {
    if (support !== 'ask' || !store.granted) return
    void askPermission().then((ok) => ok && setGrants((n) => n + 1))
  }, [support, store.granted, askPermission])

  return {
    shake: paused ? null : shake,
    hint: shakeHintMode({ support, done: store.done, views: store.views }),
    onHint,
    onPlotTouch,
  }
}
