import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, VideoOff, VolumeX } from 'lucide-react'
import { CHAT_VIDEO_EXPIRED_RU } from '../../lib/chat/chatVideoCore.js'
import { formatVoiceTime } from '../../lib/chat/chatVoiceCore.js'
import { loadChatAttach } from '../../lib/chat/chatAttachCache.js'
import { pauseVoice } from '../../lib/chat/chatVoicePlayback.js'
import '../../styles/chat-video.css'

const RING_R = 106
const RING_LEN = 2 * Math.PI * RING_R

/**
 * Видеокружок в ленте: когда виден — качаем и крутим сам без звука; тап — со звуком с начала (кольцо прогресса),
 * ещё тап — пауза. Ушёл с экрана — пауза. Через сутки — «Видео удалено через сутки · 0:12».
 * @param {{ id: string, attach: { sec: number|null, expired: boolean }, load: (id: string) => Promise<{ blob: Blob, mime: string }> }} props
 */
export function ChatVideoBubble({ id, attach, load }) {
  const boxRef = useRef(null)
  const videoRef = useRef(null)
  const [file, setFile] = useState({ url: '', status: 'idle', error: '' })
  const [sound, setSound] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  const fetchFile = useCallback(() => {
    setFile((f) => ({ ...f, status: 'loading', error: '' }))
    loadChatAttach(id, load).then(
      (out) => setFile({ url: out.url, status: 'ready', error: '' }),
      (e) => setFile({ url: '', status: 'error', error: e?.message || 'Не загрузилось' }),
    )
  }, [id, load])

  useEffect(() => {
    const el = boxRef.current
    if (!el || attach.expired) return undefined
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true)
      return undefined
    }
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [attach.expired])

  useEffect(() => {
    if (visible && file.status === 'idle') fetchFile()
  }, [visible, file.status, fetchFile])

  /* Без звука — крутится, пока виден; со звуком — пока не нажали паузу или не ушёл с экрана. */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !file.url) return
    if (!visible) {
      v.pause()
      if (sound) setSound(false)
      return
    }
    if (!sound) {
      v.muted = true
      void v.play().catch(() => {})
    }
  }, [visible, file.url, sound])

  const tap = () => {
    const v = videoRef.current
    if (file.status === 'error') return fetchFile()
    if (!v || !file.url) return undefined
    if (!sound) {
      pauseVoice()
      setSound(true)
      v.muted = false
      v.loop = false
      v.currentTime = 0
      void v.play().catch(() => {})
    } else if (v.paused) void v.play().catch(() => {})
    else v.pause()
    return undefined
  }

  if (attach.expired) {
    return (
      <div className="chat-video-gone" data-testid="chat-video-gone">
        <VideoOff size={18} aria-hidden />
        <span>
          {CHAT_VIDEO_EXPIRED_RU}
          {attach.sec ? ` · ${formatVoiceTime(attach.sec)}` : ''}
        </span>
      </div>
    )
  }
  const shown = sound ? progress : 0
  return (
    <button
      ref={boxRef}
      type="button"
      className={`chat-video${sound ? ' is-sound' : ''}`}
      aria-label={file.status === 'error' ? 'Загрузить видео ещё раз' : sound && playing ? 'Пауза' : 'Смотреть со звуком'}
      data-testid="chat-video"
      onClick={tap}
    >
      {file.url ? (
        <video
          ref={videoRef}
          className="chat-video__media"
          src={file.url}
          muted
          loop={!sound}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          onEnded={() => {
            setSound(false)
            setProgress(0)
          }}
        />
      ) : null}
      {file.status === 'loading' || file.status === 'idle' ? <Loader2 size={24} className="chat-video__spin" aria-hidden /> : null}
      {file.status === 'error' ? (
        <span className="chat-video__error">
          <RotateCcw size={18} aria-hidden />
          {file.error}
        </span>
      ) : null}
      {sound ? (
        <svg className="chat-video__ring" viewBox="0 0 220 220" aria-hidden>
          <circle cx="110" cy="110" r={RING_R} style={{ strokeDasharray: RING_LEN, strokeDashoffset: RING_LEN * (1 - shown) }} />
        </svg>
      ) : null}
      <span className="chat-video__time">
        {!sound ? <VolumeX size={12} aria-hidden /> : null}
        {formatVoiceTime(Math.max(0, Math.round((attach.sec ?? 0) * (1 - shown))))}
      </span>
    </button>
  )
}
