import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_VOICE_TEXT_FAILED_RU } from '../lib/chat/chatVoiceCore.js'

const POLL_MS = 1500
const POLL_TRIES = 80

const pause = (ms) => new Promise((r) => window.setTimeout(r, ms))

/**
 * «→ Аа» под голосовым: распознавание идёт на сервере, спрашиваем, пока не готово. Готовый текст сервер хранит —
 * у собеседника он уже есть без новой расшифровки (приходит в сообщении).
 * @param {{ initial: string|null, load: () => Promise<{ done: boolean, text?: string }> }} p
 */
export function useChatVoiceText({ initial, load }) {
  const [state, setState] = useState({ text: initial, busy: false, error: '' })
  const aliveRef = useRef(true)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const text = state.text ?? initial
  const request = useCallback(async () => {
    if (state.busy) return
    setState({ text: null, busy: true, error: '' })
    try {
      for (let i = 0; i < POLL_TRIES && aliveRef.current; i += 1) {
        const out = await loadRef.current()
        if (out?.done) {
          if (aliveRef.current) setState({ text: String(out.text ?? ''), busy: false, error: '' })
          return
        }
        await pause(POLL_MS)
      }
      if (aliveRef.current) setState({ text: null, busy: false, error: CHAT_VOICE_TEXT_FAILED_RU })
    } catch (e) {
      if (aliveRef.current) setState({ text: null, busy: false, error: e?.message || CHAT_VOICE_TEXT_FAILED_RU })
    }
  }, [state.busy])

  return { text, busy: state.busy, error: state.error, request }
}
