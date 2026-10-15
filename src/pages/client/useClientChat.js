import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clientChatVoice,
  fetchClientChatThread,
  fetchClientChats,
  reactClientChatMessage,
  searchClientChat,
  sendClientChatMessage,
} from '../../lib/client/clientChatService.js'
import { ClientSessionGoneError } from '../../lib/client/clientSession.js'
import { useChatThread } from '../../hooks/useChatThread.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { peekScreenCache, readScreenCache, writeScreenCache } from '../../lib/screenCache/screenCacheStore.js'

const LIST_CACHE = screenCacheKey('client', 'chats')

/**
 * Три диалога клиента для экрана «Сообщения». Сначала сохранённый на телефоне список (кэш экранов), затем сервер;
 * сеть не ответила, а список есть — status 'stale' (список остаётся, плашка «Нет сети» в оболочке).
 */
export function useClientChats() {
  const [state, setState] = useState(() => ({ threads: peekScreenCache(LIST_CACHE), status: 'loading', error: '' }))
  const freshRef = useRef(false)
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchClientChats()
      .then(({ threads }) => {
        freshRef.current = true
        setState({ threads, status: 'ready', error: '' })
        void writeScreenCache(LIST_CACHE, threads)
      })
      .catch((e) =>
        setState((s) => {
          if (e instanceof ClientSessionGoneError) return { ...s, status: 'signed_out', error: e?.message || '' }
          return { ...s, status: s.threads ? 'stale' : 'error', error: e?.message || '' }
        }),
      )
  }, [])
  useEffect(() => {
    reload()
    void readScreenCache(LIST_CACHE).then((threads) => {
      if (threads && !freshRef.current) setState((s) => (s.threads ? s : { ...s, threads, status: s.status === 'error' ? 'stale' : s.status }))
    })
  }, [reload])
  return { ...state, reload }
}

/** Лента одного диалога клиента. */
export function useClientChatThread(kind) {
  const load = useCallback((before, opts) => fetchClientChatThread(kind, before, opts?.seen), [kind])
  const send = useCallback((outgoing) => sendClientChatMessage(kind, outgoing), [kind])
  const react = useCallback((messageId, emoji) => reactClientChatMessage(kind, messageId, emoji), [kind])
  const search = useCallback((q) => searchClientChat(kind, q), [kind])
  const voice = useMemo(() => clientChatVoice(kind), [kind])
  return useChatThread({ key: kind, side: 'client', cacheKey: screenCacheKey('client', 'chat', kind), load, send, react, search, voice })
}
