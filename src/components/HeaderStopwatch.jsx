import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Timer } from 'lucide-react'

function formatStopwatch(ms) {
  const t = Math.max(0, Math.floor(ms))
  const tenths = Math.floor((t % 1000) / 100)
  const sec = Math.floor(t / 1000) % 60
  const min = Math.floor(t / 60000) % 60
  const hour = Math.floor(t / 3600000)
  if (hour > 0) {
    return `${hour}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`
}

export function HeaderStopwatch() {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [displayMs, setDisplayMs] = useState(0)
  const baseMsRef = useRef(0)
  const startedAtRef = useRef(null)
  const rafRef = useRef(null)

  const tick = useCallback(() => {
    const start = startedAtRef.current
    if (start == null) return
    setDisplayMs(baseMsRef.current + (performance.now() - start))
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    startedAtRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [running, tick])

  const toggleRun = () => {
    if (running) {
      const start = startedAtRef.current ?? performance.now()
      baseMsRef.current += performance.now() - start
      startedAtRef.current = null
      setDisplayMs(baseMsRef.current)
      setRunning(false)
      return
    }
    setRunning(true)
  }

  const reset = () => {
    baseMsRef.current = 0
    startedAtRef.current = null
    setDisplayMs(0)
    setRunning(false)
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
          className="app-header__stopwatch-display"
          onClick={toggleRun}
          title="Старт / пауза"
          aria-label={running ? 'Пауза' : 'Старт'}
        >
          {formatStopwatch(displayMs)}
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
