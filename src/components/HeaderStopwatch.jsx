import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Timer } from 'lucide-react'
import {
  STOPWATCH_PAINT_MS,
  formatStopwatch,
  stopwatchElapsedMs,
} from '../lib/headerStopwatchCore.js'

/**
 * Секундомер в шапке. Пока идёт — цифры пишем в DOM напрямую (не setState каждый кадр),
 * иначе на планшете вместе с тапом по «Пульс» экран может «осыпаться».
 */
export function HeaderStopwatch() {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const displayRef = useRef(null)
  const baseMsRef = useRef(0)
  const startedAtRef = useRef(null)
  const intervalRef = useRef(null)

  const paint = useCallback(() => {
    const el = displayRef.current
    if (!el) return
    el.textContent = formatStopwatch(
      stopwatchElapsedMs({
        baseMs: baseMsRef.current,
        startedAt: startedAtRef.current,
        now: performance.now(),
      }),
    )
  }, [])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!running) {
      paint()
      return undefined
    }
    startedAtRef.current = performance.now()
    paint()
    intervalRef.current = window.setInterval(paint, STOPWATCH_PAINT_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [running, paint])

  const toggleRun = () => {
    if (running) {
      const start = startedAtRef.current ?? performance.now()
      baseMsRef.current += performance.now() - start
      startedAtRef.current = null
      setRunning(false)
      return
    }
    setRunning(true)
  }

  const reset = () => {
    baseMsRef.current = 0
    startedAtRef.current = null
    setRunning(false)
    const el = displayRef.current
    if (el) el.textContent = formatStopwatch(0)
  }

  const toggleOpen = () => {
    setOpen((v) => !v)
  }

  return (
    <div className={`app-header__stopwatch${open ? ' app-header__stopwatch--open' : ''}`}>
      <button
        type="button"
        className="btn btn-ghost app-header__action app-header__stopwatch-toggle"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="app-header-stopwatch-panel"
        title={open ? 'Свернуть секундомер' : 'Секундомер'}
        aria-label={open ? 'Свернуть секундомер' : 'Открыть секундомер'}
      >
        <Timer size={20} aria-hidden />
      </button>

      <div id="app-header-stopwatch-panel" className="app-header__stopwatch-panel" aria-hidden={!open}>
        <button
          type="button"
          ref={displayRef}
          className="app-header__stopwatch-display"
          onClick={toggleRun}
          title="Старт / пауза"
          aria-label={running ? 'Пауза' : 'Старт'}
        >
          {formatStopwatch(0)}
        </button>
        <button
          type="button"
          className="app-header__stopwatch-ctl"
          onClick={toggleRun}
          title={running ? 'Пауза' : 'Старт'}
          aria-label={running ? 'Пауза' : 'Старт'}
        >
          {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button
          type="button"
          className="app-header__stopwatch-ctl"
          onClick={reset}
          title="Стоп и сброс"
          aria-label="Стоп и сброс"
        >
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
    </div>
  )
}
