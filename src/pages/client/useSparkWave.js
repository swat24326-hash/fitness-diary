import { useEffect, useState } from 'react'
import { sparkWaveDuration, sparkWaveLift } from '../../lib/client/sparkShakeCore.js'

/**
 * Волна по графику после тряски: покадрово смещение каждой точки по вертикали, px (null — график в покое).
 * Новая тряска (shake.n) — волна заново.
 * @param {{ n: number, amps: number[] } | null} shake
 * @returns {number[] | null}
 */
export function useSparkWave(shake) {
  const [lifts, setLifts] = useState(null)
  useEffect(() => {
    if (!shake?.amps.length) return undefined
    const { amps } = shake
    const total = sparkWaveDuration(amps.length)
    const start = performance.now()
    let raf = 0
    const frame = (now) => {
      const t = now - start
      if (t >= total) {
        setLifts(null)
        return
      }
      setLifts(amps.map((amp, i) => sparkWaveLift(amp, i, t)))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      setLifts(null)
    }
  }, [shake])
  return lifts
}
