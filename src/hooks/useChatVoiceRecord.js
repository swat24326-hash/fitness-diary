import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_VOICE_BAD_RU,
  CHAT_VOICE_HOLD_RU,
  CHAT_VOICE_MAX_SEC,
  CHAT_VOICE_MIN_SEC,
  CHAT_VOICE_OFFLINE_RU,
  CHAT_VOICE_ONCE_ON_RU,
  CHAT_VOICE_SHORT_RU,
  isVoiceTap,
  voiceGesture,
} from '../lib/chat/chatVoiceCore.js'
import { clearVoiceDraft, readVoiceDraft, saveVoiceDraft } from '../lib/chat/chatVoiceDraftStore.js'
import { forgetVoice, pauseVoice, updateVoiceTrack } from '../lib/chat/chatVoicePlayback.js'
import { isChatVoiceSupported, startChatVoice } from '../lib/chat/chatVoiceRecorder.js'
import { voicePartsBase64 } from '../lib/chat/chatVoiceParts.js'
import { clampVoiceTrim, voiceTrimPlan } from '../lib/chat/chatVoiceTrimCore.js'
import { isAppOnline } from '../lib/networkReachability.js'

const LIVE_BARS = 32
const HINT_MS = 2500
const FULL = [0, 1]
const IDLE = {
  phase: 'idle',
  ready: false,
  seconds: 0,
  levels: [],
  dx: 0,
  dy: 0,
  error: '',
  hint: '',
  result: null,
  trim: FULL,
  live: false,
  previewKey: '',
  once: false,
}
let previewSeq = 0
const nextPreviewKey = () => `voice-preview-${(previewSeq += 1)}`
const toSec = (seconds) => Math.min(CHAT_VOICE_MAX_SEC, Math.max(1, Math.round(seconds)))
/** Запись: куски (Blob), точная длительность dur — для обрезки, sec — на экран и сервер, волна. */
const toResult = (out) => ({ parts: out.parts, dur: out.seconds, sec: toSec(out.seconds), wave: out.wave })

const buzz = () => navigator.vibrate?.(15)

/**
 * Голосовое, как в Telegram. Держишь 🎤 — пишется (holding); отпустил — ушло; влево — отмена; вверх — без рук (locked:
 * «Отмена» · ■ — пауза (review: прослушать, обрезать края, 🎤 — дописать) · «Отправить»). Короткое нажатие пальцем —
 * onTap (переключить на 📹, если камера есть), иначе подсказка «Удерживайте»; мышью — сразу без рук (как Telegram Web). На 5:00 запись встаёт на паузу — сама не уходит.
 * Не отправилось — запись остаётся (review). Ушли из диалога — запись ждёт черновиком (draftKey).
 * Долгое нажатие на «Отправить» — «без звука» (finish({ silent: true })). «1» без рук / на паузе — одноразовое (once).
 * @param {{ send: (voice: { parts: string[], trim: [number, number] | null, sec: number, wave: number[], silent?: boolean, once?: boolean }) => Promise<boolean>,
 *   enabled: boolean, draftKey?: string }} p
 */
export function useChatVoiceRecord({ send, enabled, draftKey = '', onTap = null }) {
  const [state, setState] = useState(IDLE)
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap
  const recRef = useRef(null)
  const runRef = useRef(0)
  const originRef = useRef(null)
  const phaseRef = useRef(state.phase)
  const resultRef = useRef(null)
  const trimRef = useRef(FULL)
  const onceRef = useRef(false)
  const sendRef = useRef(send)
  const draftKeyRef = useRef(draftKey)
  phaseRef.current = state.phase
  resultRef.current = state.result
  trimRef.current = state.trim
  onceRef.current = state.once
  sendRef.current = send
  draftKeyRef.current = draftKey

  const drop = useCallback(() => {
    runRef.current += 1
    originRef.current = null
    recRef.current?.cancel()
    recRef.current = null
  }, [])

  /** Ушли из диалога / закрыли экран: запись — в черновик этого диалога, микрофон гаснет сразу. */
  const stash = useCallback((key) => {
    const rec = recRef.current
    const phase = phaseRef.current
    const result = resultRef.current
    const trim = phase === 'review' ? trimRef.current : FULL
    const once = onceRef.current
    runRef.current += 1
    originRef.current = null
    recRef.current = null
    if (!key) {
      rec?.cancel()
      return
    }
    if (rec) {
      void rec
        .stop()
        .then((out) => out.seconds >= CHAT_VOICE_MIN_SEC && saveVoiceDraft(key, { result: toResult(out), trim, once }))
        .catch(() => {})
    } else if (result && (phase === 'review' || phase === 'sending')) saveVoiceDraft(key, { result, trim, once })
  }, [])

  useEffect(() => {
    const draft = readVoiceDraft(draftKey)
    setState(
      draft
        ? { ...IDLE, phase: 'review', result: draft.result, trim: draft.trim, once: draft.once === true, seconds: draft.result.sec, previewKey: nextPreviewKey() }
        : IDLE,
    )
    return () => stash(draftKey)
  }, [draftKey, stash])

  const { previewKey } = state
  useEffect(() => (previewKey ? () => forgetVoice(previewKey) : undefined), [previewKey])

  const cancel = useCallback(() => {
    drop()
    clearVoiceDraft(draftKeyRef.current)
    setState(IDLE)
  }, [drop])

  const begin = useCallback(async () => {
    const run = ++runRef.current
    pauseVoice()
    setState({ ...IDLE, phase: 'holding' })
    try {
      const rec = await startChatVoice({
        onLevel: (level) =>
          setState((s) => (s.phase === 'holding' || s.phase === 'locked' ? { ...s, levels: [...s.levels, level].slice(-LIVE_BARS) } : s)),
      })
      if (run !== runRef.current) {
        rec.cancel()
        return
      }
      recRef.current = rec
      setState((s) => ({ ...s, ready: true }))
    } catch (e) {
      if (run === runRef.current) setState({ ...IDLE, error: e?.message || CHAT_VOICE_BAD_RU })
    }
  }, [])

  /** Остановить запись → { parts, dur, sec, wave } или null (коротко / сбой — ошибка уже на экране). */
  const stopRecording = useCallback(async () => {
    const rec = recRef.current
    if (!rec) return null
    recRef.current = null
    originRef.current = null
    const run = runRef.current
    try {
      const out = await rec.stop()
      if (run !== runRef.current) return null
      if (out.seconds < CHAT_VOICE_MIN_SEC) {
        setState({ ...IDLE, error: CHAT_VOICE_SHORT_RU })
        return null
      }
      return toResult(out)
    } catch {
      if (run === runRef.current) setState({ ...IDLE, error: CHAT_VOICE_BAD_RU })
      return null
    }
  }, [])

  /** result — целая запись (остаётся на экране, если не ушло), trim — что из неё отправить. */
  const deliver = useCallback(async (result, trim, silent) => {
    const key = draftKeyRef.current
    setState((s) => ({ ...s, phase: 'sending', result, live: false, error: '' }))
    let sent = false
    try {
      const parts = await voicePartsBase64(result.parts)
      const plan = voiceTrimPlan(result, trim)
      sent = await sendRef.current({ parts, ...plan, ...(silent ? { silent: true } : {}), ...(onceRef.current ? { once: true } : {}) })
    } catch {
      setState((s) => ({ ...s, error: CHAT_VOICE_BAD_RU }))
    }
    if (sent) clearVoiceDraft(key)
    setState(sent ? IDLE : (s) => ({ ...s, phase: 'review', result }))
  }, [])

  /** «Отправить»: из удержания, без рук или с паузы (с обрезкой). silent — push собеседнику без звука. */
  const finish = useCallback(
    async ({ silent = false } = {}) => {
      const trim = phaseRef.current === 'review' ? trimRef.current : FULL
      if (phaseRef.current === 'review' && !recRef.current && resultRef.current) return deliver(resultRef.current, trim, silent)
      const result = await stopRecording()
      if (result) await deliver(result, trim, silent)
    },
    [deliver, stopRecording],
  )

  /** ■ без рук или 5:00 — пауза: прослушать и обрезать; 🎤 — дописать (до 5:00). */
  const review = useCallback(async () => {
    const rec = recRef.current
    if (!rec) return
    rec.pause()
    const run = runRef.current
    try {
      const snap = await rec.snapshot()
      if (run !== runRef.current) return
      setState((s) => ({
        ...s,
        phase: 'review',
        live: snap.seconds < CHAT_VOICE_MAX_SEC,
        result: toResult(snap),
        trim: FULL,
        seconds: snap.seconds,
        dx: 0,
        dy: 0,
        previewKey: nextPreviewKey(),
      }))
    } catch {
      if (run === runRef.current) cancel()
    }
  }, [cancel])

  /** 🎤 на паузе — дописать к той же записи (микрофон включается снова); обрезка сбрасывается. */
  const resume = useCallback(async () => {
    const rec = recRef.current
    if (!rec || rec.seconds() >= CHAT_VOICE_MAX_SEC) return
    const run = runRef.current
    pauseVoice()
    try {
      await rec.resume()
    } catch (e) {
      if (run === runRef.current) setState((s) => ({ ...s, error: e?.message || CHAT_VOICE_BAD_RU }))
      return
    }
    if (run !== runRef.current) return
    setState((s) => ({ ...s, phase: 'locked', live: false, result: null, trim: FULL, previewKey: '', error: '' }))
  }, [])

  /** «1» — одноразовое: собеседник прослушает один раз. Включили — подсказка, как в Telegram. */
  const toggleOnce = useCallback(() => {
    setState((s) => ({ ...s, once: !s.once, hint: s.once ? '' : CHAT_VOICE_ONCE_ON_RU }))
  }, [])

  const setTrim = useCallback((range) => {
    const sec = resultRef.current?.sec ?? 1
    const next = clampVoiceTrim(range, sec)
    setState((s) => ({ ...s, trim: next }))
    updateVoiceTrack(state.previewKey, { range: next })
  }, [state.previewKey])

  const onPointerDown = useCallback(
    (e) => {
      if ((e.button ?? 0) !== 0 || phaseRef.current !== 'idle') return
      e.preventDefault()
      if (!isAppOnline()) {
        setState({ ...IDLE, error: CHAT_VOICE_OFFLINE_RU })
        return
      }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      originRef.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, mouse: e.pointerType === 'mouse' }
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
        setState((s) => ({ ...s, phase: 'locked', dx: 0, dy: 0 }))
      } else setState((s) => ({ ...s, dx, dy }))
    },
    [cancel],
  )

  /** Длительность нажатия — по времени событий: пока грузится кодировщик, обработка может опоздать. */
  const onPointerUp = useCallback((e) => {
    const o = originRef.current
    originRef.current = null
    if (!o || phaseRef.current !== 'holding') return
    if (isVoiceTap(e.timeStamp - o.at)) {
      if (o.mouse) setState((s) => ({ ...s, phase: 'locked', dx: 0, dy: 0 }))
      else {
        drop()
        setState(onTapRef.current ? IDLE : { ...IDLE, hint: CHAT_VOICE_HOLD_RU })
        onTapRef.current?.()
      }
      return
    }
    if (!recRef.current) {
      drop()
      setState({ ...IDLE, hint: CHAT_VOICE_HOLD_RU })
      return
    }
    void finish()
  }, [drop, finish])

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
      if (seconds >= CHAT_VOICE_MAX_SEC) void review()
      else setState((s) => ({ ...s, seconds }))
    }, 200)
    return () => window.clearInterval(t)
  }, [recording, review])

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
    available: Boolean(enabled) && isChatVoiceSupported(),
    press: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    cancel,
    finish,
    review,
    resume,
    setTrim,
    toggleOnce,
    clearError,
  }
}
