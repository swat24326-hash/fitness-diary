import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/** Верх поля ввода в окне: затемнение над лентой кончается здесь — таймер и «Отмена» остаются яркими. */
function useComposerTop(anchorRef) {
  const [top, setTop] = useState(null)
  useLayoutEffect(() => {
    const measure = () => setTop(anchorRef.current?.getBoundingClientRect().top ?? null)
    measure()
    const vv = window.visualViewport
    window.addEventListener('resize', measure)
    vv?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      vv?.removeEventListener('resize', measure)
    }
  }, [anchorRef])
  return top
}

/** Круг вырастает из кнопки 📹: сдвиг и масштаб от кнопки к своему месту — до первого кадра, потом класс с анимацией. */
function useGrowFromButton(circleRef) {
  useLayoutEffect(() => {
    const el = circleRef.current
    const btn = globalThis.document.querySelector('[data-testid="chat-video-button"]')
    if (!el || !btn || el.classList.contains('is-growing')) return
    el.style.animation = 'none'
    const to = el.getBoundingClientRect()
    el.style.animation = ''
    const from = btn.getBoundingClientRect()
    if (!to.width || !from.width) return
    el.style.setProperty('--grow-x', `${from.left + from.width / 2 - (to.left + to.width / 2)}px`)
    el.style.setProperty('--grow-y', `${from.top + from.height / 2 - (to.top + to.height / 2)}px`)
    el.style.setProperty('--grow-scale', String(from.width / to.width))
    el.classList.add('is-growing')
  }, [circleRef])
}

/**
 * Как в Telegram: крупный круг в верхней части экрана, лента за ним затемнена и размыта; поле ввода — без затемнения.
 * Живая фронтальная камера (зеркально), кольцо — сколько осталось до минуты. Касания проходят сквозь — палец на 📹.
 * @param {{ vid: ReturnType<typeof import('../../hooks/useChatVideoRecord.js').useChatVideoRecord> }} props
 */
export function ChatVideoCircle({ vid }) {
  const ref = useRef(null)
  const anchorRef = useRef(null)
  const circleRef = useRef(null)
  const top = useComposerTop(anchorRef)
  useGrowFromButton(circleRef)
  const resultUrl = useResultUrl(vid.stream ? null : vid.result?.video)
  const [liveStream, setLiveStream] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !vid.stream) return
    el.srcObject = vid.stream
    void el.play().catch(() => {})
  }, [vid.stream])
  const left = 1 - Math.min(1, vid.seconds / CHAT_VIDEO_MAX_SEC)
  const overlay = (
    <div className="chat-video-rec" style={top != null ? { height: `${top}px` } : undefined} data-testid="chat-video-circle">
      <div ref={circleRef} className="chat-video-rec__circle">
        {!resultUrl && liveStream !== vid.stream ? <span className="chat-video-rec__wait">Включаем камеру…</span> : null}
        {vid.stream ? (
          <video
            ref={ref}
            className={`chat-video-rec__live${liveStream === vid.stream ? ' is-ready' : ''}`}
            muted
            playsInline
            autoPlay
            aria-label="Камера"
            onPlaying={() => setLiveStream(vid.stream)}
          />
        ) : resultUrl ? (
          <video className="chat-video-rec__live is-result" src={resultUrl} muted playsInline autoPlay loop aria-label="Записанное видео" />
        ) : null}
        <svg className="chat-video-rec__ring" viewBox="0 0 240 240" aria-hidden>
          <circle cx="120" cy="120" r={RING_R} style={{ strokeDasharray: RING_LEN, strokeDashoffset: RING_LEN * (1 - left) }} />
        </svg>
      </div>
    </div>
  )
  return (
    <>
      <span ref={anchorRef} className="chat-video-rec__anchor" aria-hidden />
      {createPortal(overlay, document.body)}
    </>
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
    const holding = phase === 'holding' && !vid.armed
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
