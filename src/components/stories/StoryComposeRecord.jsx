import { useEffect, useRef, useState } from 'react'
import { SwitchCamera, X } from 'lucide-react'
import { isVideoEnding } from '../../lib/chat/chatVideoCore.js'
import { formatVoiceTime } from '../../lib/chat/chatVoiceCore.js'
import { STORY_VIDEO_MAX_SEC } from '../../lib/stories/storyClubCore.js'
import { prepareStoryVideo } from '../../lib/stories/storyVideoPrepare.js'
import { isStoryVideoSupported, startStoryVideo } from '../../lib/stories/storyVideoRecord.js'

/**
 * Запись видео сторис с камеры: полный экран, стоп по кнопке, до 60 с.
 */
export function StoryComposeRecord({ onDone, onCancel }) {
  const videoRef = useRef(null)
  const recRef = useRef(null)
  const tickRef = useRef(0)
  const finishing = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const [facing, setFacing] = useState('environment')
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!isStoryVideoSupported()) {
      setError('Этот браузер не умеет записывать видео')
      return undefined
    }
    let alive = true
    finishing.current = false
    setError('')
    setBusy(true)
    setLive(false)
    setSeconds(0)

    const stopTick = () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = 0
      }
    }

    startStoryVideo({ facingMode: facing })
      .then((rec) => {
        if (!alive) {
          rec.cancel()
          return
        }
        recRef.current = rec
        const el = videoRef.current
        if (el) {
          el.srcObject = rec.stream
          void el.play().catch(() => {})
        }
        setLive(true)
        setBusy(false)
        tickRef.current = window.setInterval(() => {
          const sec = rec.seconds()
          setSeconds(sec)
          if (sec >= STORY_VIDEO_MAX_SEC && !finishing.current) {
            finishing.current = true
            stopTick()
            void (async () => {
              setBusy(true)
              recRef.current = null
              try {
                const { blob, seconds: raw } = await rec.stop()
                setLive(false)
                onDoneRef.current(await prepareStoryVideo(blob, { sec: Math.max(1, Math.round(raw)) }))
              } catch (e) {
                setError(e?.message || 'Видео не записалось')
                setBusy(false)
                finishing.current = false
              }
            })()
          }
        }, 200)
      })
      .catch((e) => {
        if (!alive) return
        setBusy(false)
        setError(e?.message || 'Камера не открылась')
      })

    return () => {
      alive = false
      stopTick()
      recRef.current?.cancel()
      recRef.current = null
    }
  }, [facing])

  const finish = async () => {
    const rec = recRef.current
    if (!rec || busy || finishing.current) return
    finishing.current = true
    setBusy(true)
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = 0
    }
    recRef.current = null
    try {
      const { blob, seconds: raw } = await rec.stop()
      setLive(false)
      onDoneRef.current(await prepareStoryVideo(blob, { sec: Math.max(1, Math.round(raw)) }))
    } catch (e) {
      setError(e?.message || 'Видео не записалось')
      setBusy(false)
      finishing.current = false
    }
  }

  const ending = isVideoEnding(seconds)

  return (
    <div className="stories-compose-rec" role="dialog" aria-modal="true" aria-label="Запись видео">
      <video
        ref={videoRef}
        className={`stories-compose-rec__live${facing === 'user' ? ' is-mirror' : ''}${live ? ' is-on' : ''}`}
        muted
        playsInline
        autoPlay
      />
      <header className="stories-compose-rec__top">
        <button
          type="button"
          className="stories-compose-rec__icon btn-touch"
          onClick={() => {
            recRef.current?.cancel()
            onCancel()
          }}
          aria-label="Отмена"
        >
          <X size={22} aria-hidden />
        </button>
        <span className={`stories-compose-rec__time${ending ? ' is-ending' : ''}`}>
          {formatVoiceTime(seconds)} / {formatVoiceTime(STORY_VIDEO_MAX_SEC)}
        </span>
        <button
          type="button"
          className="stories-compose-rec__icon btn-touch"
          disabled={busy}
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Сменить камеру"
          title="Сменить камеру"
        >
          <SwitchCamera size={22} aria-hidden />
        </button>
      </header>
      {error ? <p className="stories-compose-rec__error">{error}</p> : null}
      <footer className="stories-compose-rec__bar">
        <button
          type="button"
          className={`stories-compose-rec__shutter btn-touch${live ? ' is-live' : ''}`}
          disabled={busy || !live}
          onClick={() => void finish()}
          aria-label="Остановить и добавить"
        >
          <span />
        </button>
        <small>Нажмите, чтобы закончить · до 60 с</small>
      </footer>
    </div>
  )
}
