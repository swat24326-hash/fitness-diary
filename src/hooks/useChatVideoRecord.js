import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_VOICE_MODE_RU, CHAT_VIDEO_BAD_RU, CHAT_VIDEO_MAX_SEC, CHAT_VIDEO_MIN_SEC, CHAT_VIDEO_MODE_RU, CHAT_VIDEO_OFFLINE_RU, CHAT_VIDEO_SHORT_RU } from '../lib/chat/chatVideoCore.js'
import { isChatVideoSupported, startChatVideo } from '../lib/chat/chatVideoRecorder.js'
import { CHAT_VOICE_TAP_MS, isVoiceTap, voiceGesture } from '../lib/chat/chatVoiceCore.js'
import { pauseVoice } from '../lib/chat/chatVoicePlayback.js'
import { isAppOnline } from '../lib/networkReachability.js'

const HINT_MS = 2500
const IDLE = { phase: 'idle', armed: false, stream: null, seconds: 0, dx: 0, dy: 0, error: '', hint: '', result: null }
const toSec = (seconds) => Math.min(CHAT_VIDEO_MAX_SEC, Math.max(1, Math.round(seconds)))
const buzz = () => navigator.vibrate?.(15)

/**
 * Видеокружок, как в Telegram. Короткое касание 🎤 / 📹 — переключить вид записи (mode). Держишь 📹 — пишется
 * (holding); отпустил — ушло; влево — отмена; вверх — без рук (locked: «Отмена» · «Отправить»). На 60 с запись
 * встаёт (stopped) и ждёт «Отправить». Не отправилось — запись остаётся (stopped), можно повторить.
 * @param {{ send: (video: { video: Blob, sec: number, silent?: boolean }) => Promise<boolean>, enabled: boolean }} p
 */
export function useChatVideoRecord({ send, enabled }) {
  const [state, setState] = useState(IDLE)
  const [mode, setMode] = useState('voice')
  const recRef = useRef(null)
  const runRef = useRef(0)
  const armRef = useRef(0)
  const originRef = useRef(null)
  const phaseRef = useRef(state.phase)
  const resultRef = useRef(null)
  const sendRef = useRef(send)
  const modeRef = useRef(mode)
  phaseRef.current = state.phase
  resultRef.current = state.result
  sendRef.current = send
  const available = Boolean(enabled) && isChatVideoSupported()

  const drop = useCallback(() => {
    runRef.current += 1
    originRef.current = null
    window.clearTimeout(armRef.current)
    recRef.current?.cancel()
    recRef.current = null
  }, [])

  useEffect(() => drop, [drop])

  const cancel = useCallback(() => {
    drop()
    setState(IDLE)
  }, [drop])

  /** Короткое касание: 🎤 ↔ 📹 и подсказка, что теперь держать. */
  const toggleMode = useCallback(() => {
    const next = modeRef.current === 'video' ? 'voice' : 'video'
    modeRef.current = next
    setMode(next)
    setState((s) => ({ ...s, hint: next === 'video' ? CHAT_VIDEO_MODE_RU : CHAT_VOICE_MODE_RU }))
  }, [])

  /**
   * Камера включается сразу (ей нужно время), а круг и панель — только когда ясно, что это удержание, а не касание
   * «переключить на 🎤»: иначе касание мигает затемнением на весь экран.
   */
  const begin = useCallback(async () => {
    const run = ++runRef.current
    pauseVoice()
    setState({ ...IDLE, phase: 'holding', armed: true })
    armRef.current = window.setTimeout(() => {
      if (run !== runRef.current) return
      buzz()
      setState((s) => (s.armed ? { ...s, armed: false } : s))
    }, CHAT_VOICE_TAP_MS)
    try {
      const rec = await startChatVideo()
      if (run !== runRef.current) {
        rec.cancel()
        return
      }
      recRef.current = rec
      setState((s) => ({ ...s, stream: rec.stream }))
    } catch (e) {
      if (run === runRef.current) setState({ ...IDLE, error: e?.message || CHAT_VIDEO_BAD_RU })
    }
  }, [])

  /** Остановить камеру → { video, sec } или null (коротко / сбой — ошибка уже на экране). */
  const stopRecording = useCallback(async () => {
    const rec = recRef.current
    if (!rec) return resultRef.current
    recRef.current = null
    originRef.current = null
    const run = runRef.current
    try {
      const out = await rec.stop()
      if (run !== runRef.current) return null
      if (out.seconds < CHAT_VIDEO_MIN_SEC) {
        setState({ ...IDLE, error: CHAT_VIDEO_SHORT_RU })
        return null
      }
      const result = { video: out.blob, sec: toSec(out.seconds) }
      setState((s) => ({ ...s, stream: null, result }))
      return result
    } catch (e) {
      if (run === runRef.current) setState({ ...IDLE, error: e?.message || CHAT_VIDEO_BAD_RU })
      return null
    }
  }, [])

  /** «Отправить» (или отпустили палец). silent — push собеседнику без звука. */
  const finish = useCallback(
    async ({ silent = false } = {}) => {
      const result = await stopRecording()
      if (!result) return
      setState((s) => ({ ...s, phase: 'sending', error: '' }))
      const sent = await sendRef.current({ ...result, ...(silent ? { silent: true } : {}) })
      setState(sent ? IDLE : (s) => ({ ...s, phase: 'stopped' }))
    },
    [stopRecording],
  )

  /** 60 секунд — камера гаснет, запись ждёт «Отправить». */
  const halt = useCallback(async () => {
    originRef.current = null
    const result = await stopRecording()
    if (result) setState((s) => ({ ...s, phase: 'stopped', dx: 0, dy: 0 }))
  }, [stopRecording])

  const onPointerDown = useCallback(
    (e) => {
      if ((e.button ?? 0) !== 0 || phaseRef.current !== 'idle') return
      e.preventDefault()
      if (!isAppOnline()) {
        setState({ ...IDLE, error: CHAT_VIDEO_OFFLINE_RU })
        return
      }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      originRef.current = { x: e.clientX, y: e.clientY, at: e.timeStamp }
      void begin()
    },
    [begin],
  )

  const onPointerMove = useCallback(
    (e) => {
      const o = originRef.current
      if (!o || phaseRef.current !== 'holding') return
      const dx = e.clientX - o.x
      const dy = e.clientY - o.y
      const gesture = voiceGesture(dx, dy)
      if (gesture === 'cancel') {
        buzz()
        cancel()
      } else if (gesture === 'lock') {
        buzz()
        originRef.current = null
        window.clearTimeout(armRef.current)
        setState((s) => ({ ...s, phase: 'locked', armed: false, dx: 0, dy: 0 }))
      } else setState((s) => ({ ...s, dx, dy }))
    },
    [cancel],
  )

  const onPointerUp = useCallback(
    (e) => {
      const o = originRef.current
      originRef.current = null
      if (!o || phaseRef.current !== 'holding') return
      if (isVoiceTap(e.timeStamp - o.at)) {
        drop()
        setState(IDLE)
        toggleMode()
        return
      }
      if (!recRef.current) {
        cancel()
        return
      }
      void finish()
    },
    [cancel, drop, finish, toggleMode],
  )

  const onPointerCancel = useCallback(() => {
    if (originRef.current && phaseRef.current === 'holding') cancel()
  }, [cancel])

  const recording = state.phase === 'holding' || state.phase === 'locked'
  useEffect(() => {
    if (!recording) return undefined
    const t = window.setInterval(() => {
      const rec = recRef.current
      if (!rec) return
      const seconds = rec.seconds()
      if (seconds >= CHAT_VIDEO_MAX_SEC) void halt()
      else setState((s) => ({ ...s, seconds }))
    }, 200)
    return () => window.clearInterval(t)
  }, [recording, halt])

  const { phase, hint } = state
  useEffect(() => {
    if (phase === 'idle' || phase === 'sending') return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') cancel()
      else if (e.key === 'Enter' && phase !== 'holding') {
        e.preventDefault()
        void finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, cancel, finish])

  useEffect(() => {
    if (!hint) return undefined
    const t = window.setTimeout(() => setState((s) => (s.hint === hint ? { ...s, hint: '' } : s)), HINT_MS)
    return () => window.clearTimeout(t)
  }, [hint])

  const clearError = useCallback(() => setState((s) => (s.error ? { ...s, error: '' } : s)), [])

  return {
    ...state,
    available,
    mode: available ? mode : 'voice',
    toggleMode,
    press: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    cancel,
    finish,
    clearError,
  }
}
