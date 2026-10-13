import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_DICTATION_FAILED_RU,
  CHAT_DICTATION_MAX_SEC,
  CHAT_DICTATION_MIN_SEC,
  CHAT_DICTATION_OFFLINE_RU,
  CHAT_DICTATION_SHORT_RU,
  pushDictationLevel,
} from '../lib/chat/chatDictationCore.js'
import { isChatDictationSupported, startChatDictation } from '../lib/chat/chatDictationRecorder.js'
import { isAppOnline } from '../lib/networkReachability.js'

const IDLE = { phase: 'idle', seconds: 0, levels: [], error: '' }

/**
 * Голосовой ввод, как в Cursor: 🎤 — пишем (волна и таймер), ✓ — распознаём, текст уходит в onText; × / Esc — отмена.
 * Через 25 с останавливается сам. Ничего не отправляет — человек правит текст и жмёт «Отправить».
 * @param {{ dictate?: (audio: string) => Promise<{ text: string }>, onText: (text: string) => void }} p
 */
export function useChatDictation({ dictate, onText }) {
  const [state, setState] = useState(IDLE)
  const recRef = useRef(null)
  const startedRef = useRef(0)
  const runRef = useRef(0)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const drop = useCallback(() => {
    recRef.current?.cancel()
    recRef.current = null
    runRef.current += 1
  }, [])

  useEffect(() => drop, [drop])

  const stop = useCallback(async () => {
    const rec = recRef.current
    if (!rec) return
    recRef.current = null
    const run = runRef.current
    const { audio, seconds } = rec.stop()
    if (seconds < CHAT_DICTATION_MIN_SEC) {
      setState({ ...IDLE, error: CHAT_DICTATION_SHORT_RU })
      return
    }
    setState((s) => ({ ...s, phase: 'recognizing' }))
    try {
      const { text } = await dictate(audio)
      if (run !== runRef.current) return
      setState(IDLE)
      if (text) onTextRef.current(text)
    } catch (e) {
      if (run === runRef.current) setState({ ...IDLE, error: e?.message || CHAT_DICTATION_FAILED_RU })
    }
  }, [dictate])

  const start = useCallback(async () => {
    if (recRef.current) return
    if (!isAppOnline()) {
      setState({ ...IDLE, error: CHAT_DICTATION_OFFLINE_RU })
      return
    }
    const run = ++runRef.current
    setState({ ...IDLE, phase: 'recording' })
    try {
      const rec = await startChatDictation({
        onLevel: (level) => setState((s) => (s.phase === 'recording' ? { ...s, levels: pushDictationLevel(s.levels, level) } : s)),
      })
      if (run !== runRef.current) {
        rec.cancel()
        return
      }
      recRef.current = rec
      startedRef.current = Date.now()
    } catch (e) {
      if (run === runRef.current) setState({ ...IDLE, error: e?.message || CHAT_DICTATION_FAILED_RU })
    }
  }, [])

  const cancel = useCallback(() => {
    drop()
    setState(IDLE)
  }, [drop])

  const recording = state.phase === 'recording'
  useEffect(() => {
    if (!recording) return undefined
    const t = window.setInterval(() => {
      if (!recRef.current) return
      const seconds = (Date.now() - startedRef.current) / 1000
      if (seconds >= CHAT_DICTATION_MAX_SEC) void stop()
      else setState((s) => ({ ...s, seconds }))
    }, 200)
    return () => window.clearInterval(t)
  }, [recording, stop])

  const clearError = useCallback(() => setState((s) => (s.error ? { ...s, error: '' } : s)), [])

  return {
    ...state,
    available: Boolean(dictate) && isChatDictationSupported(),
    start,
    stop,
    cancel,
    clearError,
  }
}
