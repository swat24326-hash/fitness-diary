import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronUp, Lock, Video } from 'lucide-react'
import { CHAT_VIDEO_MAX_SEC, isVideoEnding } from '../../lib/chat/chatVideoCore.js'
import { formatVoiceTime, voiceCancelProgress, voiceLockProgress } from '../../lib/chat/chatVoiceCore.js'
import { ChatVoiceSendButton } from './ChatVoiceSendButton.jsx'
import '../../styles/chat-video.css'

const RING_R = 118
const RING_LEN = 2 * Math.PI * RING_R

function Timer({ seconds }) {
  return (
    <>
      <span className="chat-voice-rec__dot" aria-hidden />
      <span className={`chat-voice-rec__time${isVideoEnding(seconds) ? ' is-ending' : ''}`} aria-live="off" data-testid="chat-video-time">
        {formatVoiceTime(seconds)}
      </span>
    </>
  )
}

/** Записанный кружок (60 с или не ушло) — крутится в круге без звука, пока ждёт «Отправить». */
function useResultUrl(blob) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) return undefined
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => {
      URL.revokeObjectURL(u)
      setUrl('')
    }
  }, [blob])
  return url
}

/**
 * Круг над полем: живая фронтальная камера (зеркально), кольцо — сколько осталось до минуты.
 * @param {{ vid: ReturnType<typeof import('../../hooks/useChatVideoRecord.js').useChatVideoRecord> }} props
 */
export function ChatVideoCircle({ vid }) {
  const ref = useRef(null)
  const resultUrl = useResultUrl(vid.stream ? null : vid.result?.video)
  useEffect(() => {
    const el = ref.current
    if (!el || !vid.stream) return
    el.srcObject = vid.stream
    void el.play().catch(() => {})
  }, [vid.stream])
  const left = 1 - Math.min(1, vid.seconds / CHAT_VIDEO_MAX_SEC)
  return (
    <div className="chat-video-rec" data-testid="chat-video-circle">
      <div className="chat-video-rec__circle">
        {vid.stream ? (
          <video ref={ref} className="chat-video-rec__live" muted playsInline autoPlay aria-label="Камера" />
        ) : resultUrl ? (
          <video className="chat-video-rec__live is-result" src={resultUrl} muted playsInline autoPlay loop aria-label="Записанное видео" />
        ) : (
          <span className="chat-video-rec__wait">Включаем камеру…</span>
        )}
        <svg className="chat-video-rec__ring" viewBox="0 0 240 240" aria-hidden>
          <circle cx="120" cy="120" r={RING_R} style={{ strokeDasharray: RING_LEN, strokeDashoffset: RING_LEN * (1 - left) }} />
        </svg>
      </div>
    </div>
  )
}

/** Внутри капсулы поля: держим — «‹ Влево — отмена»; без рук / минута — «Отмена». */
export function ChatVideoPanel({ vid }) {
  if (vid.phase === 'holding') {
    const pull = voiceCancelProgress(vid.dx)
    return (
      <div className="chat-voice-rec" data-testid="chat-video-holding">
        <Timer seconds={vid.seconds} />
        <span className="chat-voice-rec__slide" style={{ transform: `translateX(${Math.min(0, vid.dx) * 0.6}px)`, opacity: 1 - pull * 0.7 }}>
          <ChevronLeft size={16} aria-hidden />
          Влево — отмена
        </span>
      </div>
    )
  }
  return (
    <div className="chat-voice-rec" data-testid="chat-video-locked">
      <Timer seconds={vid.result?.sec ?? vid.seconds} />
      <span className="chat-video-rec__label">Видеосообщение</span>
      <button type="button" className="chat-voice-rec__cancel" onClick={vid.cancel} disabled={vid.phase === 'sending'} data-testid="chat-video-cancel">
        Отмена
      </button>
    </div>
  )
}

/** Кнопка 📹 вместо 🎤: держать — снимать, коротко — обратно на голосовые. Без рук — «Отправить» (подержать — без звука). */
export function ChatVideoButton({ vid }) {
  const { phase } = vid
  if (phase === 'idle' || phase === 'holding') {
    const holding = phase === 'holding'
    const lift = voiceLockProgress(vid.dy)
    return (
      <div className="chat-voice-btn">
        {holding ? (
          <span className="chat-voice-btn__lock" style={{ transform: `translateY(${-lift * 24}px)` }} aria-hidden>
            <Lock size={16} />
            <ChevronUp size={14} />
          </span>
        ) : null}
        <button
          key="cam"
          type="button"
          className={`chat-compose__send chat-voice-btn__mic${holding ? ' is-holding' : ''}`}
          aria-label="Видеосообщение — удерживайте"
          title="Видеосообщение — удерживайте"
          data-testid="chat-video-button"
          onContextMenu={(e) => e.preventDefault()}
          {...vid.press}
        >
          <Video size={22} aria-hidden />
        </button>
      </div>
    )
  }
  return (
    <div className="chat-voice-btn">
      <ChatVoiceSendButton sending={phase === 'sending'} onSend={(opts) => void vid.finish(opts)} label="Отправить видеосообщение" />
    </div>
  )
}
