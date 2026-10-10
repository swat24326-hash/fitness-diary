import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeChatMessages } from '../lib/chat/chatMessageCore.js'
import { countNewPeerMessages } from '../lib/chat/chatSoundCore.js'
import { armChatSound, playChatSound } from '../lib/chat/chatSoundPlayer.js'
import { isAppOnline } from '../lib/networkReachability.js'

const POLL_MS = 10_000
export const CHAT_OFFLINE_RU = 'Нет сети — сообщение не отправлено'

/**
 * Лента одного диалога — общая для клиента и сотрудника. Только онлайн: очередь sync не трогаем.
 * Пока экран открыт и виден — свежие сообщения раз в 10 с.
 * @param {{ key: string, side: 'client' | 'staff', load: (before?: string) => Promise<{ messages: object[], has_more: boolean }>, send: (outgoing: { body: string } | { sticker: string }) => Promise<{ message: object }> }} p
 */
export function useChatThread({ key, side, load, send }) {
  const [state, setState] = useState({ messages: null, meta: null, hasMore: false, status: 'loading', error: '' })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const loadRef = useRef(load)
  const sendRef = useRef(send)
  const messagesRef = useRef(null)
  loadRef.current = load
  sendRef.current = send
  messagesRef.current = state.messages

  const refresh = useCallback((quiet) => {
    if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '' }))
    return loadRef
      .current()
      .then(({ messages, has_more, ...meta }) => {
        if (quiet && countNewPeerMessages(messagesRef.current, messages) > 0) playChatSound('incoming', side)
        setState((s) => ({
          messages: mergeChatMessages(s.messages, messages),
          meta,
          hasMore: s.messages ? s.hasMore : has_more,
          status: 'ready',
          error: '',
        }))
      })
      .catch((e) => {
        if (!quiet) setState((s) => ({ ...s, status: 'error', error: e?.message || 'Не загрузилось' }))
      })
  }, [side])

  useEffect(() => armChatSound(side), [side])

  useEffect(() => {
    messagesRef.current = null
    setState({ messages: null, meta: null, hasMore: false, status: 'loading', error: '' })
    void refresh(false)
    const tick = () => document.visibilityState === 'visible' && isAppOnline() && void refresh(true)
    const t = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [key, refresh])

  const loadOlder = useCallback(async () => {
    const first = state.messages?.[0]
    if (!first) return
    try {
      const { messages, has_more } = await loadRef.current(first.created_at)
      setState((s) => ({ ...s, messages: mergeChatMessages(s.messages, messages), hasMore: has_more }))
    } catch (e) {
      setState((s) => ({ ...s, error: e?.message || 'Не загрузилось' }))
    }
  }, [state.messages])

  /**
   * @param {string | { sticker: string }} input текст из поля или стикер
   * @returns {Promise<boolean>} true — отправлено, поле можно очистить
   */
  const submit = useCallback(async (input) => {
    if (!isAppOnline()) {
      setSendError(CHAT_OFFLINE_RU)
      return false
    }
    setSending(true)
    setSendError('')
    try {
      const { message } = await sendRef.current(typeof input === 'string' ? { body: input } : input)
      setState((s) => ({ ...s, messages: mergeChatMessages(s.messages, [message]) }))
      playChatSound('send', side)
      return true
    } catch (e) {
      setSendError(e?.message || CHAT_OFFLINE_RU)
      return false
    } finally {
      setSending(false)
    }
  }, [side])

  return { ...state, reload: () => refresh(false), loadOlder, submit, sending, sendError }
}
