import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clientChatVoice,
  fetchClientChatThread,
  fetchClientChats,
  reactClientChatMessage,
  searchClientChat,
  sendClientChatMessage,
} from '../../lib/client/clientChatService.js'
import {
  ClientSessionGoneError,
  clientChatAttentionEpoch,
  noteClientChatRead,
  writeClientChatAttention,
} from '../../lib/client/clientSession.js'
import { useChatThread } from '../../hooks/useChatThread.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { peekScreenCache, readScreenCache, writeScreenCache } from '../../lib/screenCache/screenCacheStore.js'
import { chatDialogKey } from '../../lib/chat/clientAzChatCore.js'

const LIST_CACHE = screenCacheKey('client', 'chats')

/**
 * Диалоги клиента для экрана «Сообщения». Сначала сохранённый на телефоне список (кэш экранов), затем сервер;
 * сеть не ответила, а список есть — status 'stale' (список остаётся, плашка «Нет сети» в оболочке).
 */
export function useClientChats() {
  const [state, setState] = useState(() => ({
    threads: peekScreenCache(LIST_CACHE),
    attention: null,
    status: 'loading',
    error: '',
  }))
  const freshRef = useRef(false)
  const genRef = useRef(0)
  const reload = useCallback(() => {
    const gen = ++genRef.current
    const epoch = clientChatAttentionEpoch()
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchClientChats()
      .then(({ threads, attention }) => {
        if (gen !== genRef.current) return
        freshRef.current = true
        const count = Math.max(0, Number(attention) || 0)
        const still = epoch === clientChatAttentionEpoch()
        setState((s) => ({ threads, attention: still ? count : s.attention, status: 'ready', error: '' }))
        if (still) writeClientChatAttention(count)
        void writeScreenCache(LIST_CACHE, threads)
      })
      .catch((e) => {
        if (gen !== genRef.current) return
        setState((s) => {
          if (e instanceof ClientSessionGoneError) return { ...s, status: 'signed_out', error: e?.message || '' }
          return { ...s, status: s.threads ? 'stale' : 'error', error: e?.message || '' }
        })
      })
  }, [])
  useEffect(() => {
    reload()
    void readScreenCache(LIST_CACHE).then((threads) => {
      if (threads && !freshRef.current) setState((s) => (s.threads ? s : { ...s, threads, status: s.status === 'error' ? 'stale' : s.status }))
    })
    return () => {
      genRef.current += 1
    }
  }, [reload])
  return { ...state, reload }
}

/** Лента одного диалога клиента. Открыли непрочитанный — единичка на вкладке гаснет сразу, не дожидаясь другого экрана. */
export function useClientChatThread(kind, peerUserId = null) {
  const peer = String(peerUserId ?? '').trim() || null
  const cacheKey = screenCacheKey('client', 'chat', chatDialogKey({ kind, peer_user_id: peer }))
  const load = useCallback(
    (before, opts) =>
      fetchClientChatThread(kind, before, opts?.seen, peer).then((page) => {
        if (page?.marked_read) noteClientChatRead()
        return page
      }),
    [kind, peer],
  )
  const send = useCallback((outgoing) => sendClientChatMessage(kind, outgoing, peer), [kind, peer])
  const react = useCallback((messageId, emoji) => reactClientChatMessage(kind, messageId, emoji, peer), [kind, peer])
  const search = useCallback((q) => searchClientChat(kind, q, peer), [kind, peer])
  const voice = useMemo(() => clientChatVoice(kind, peer), [kind, peer])
  return useChatThread({ key: cacheKey, side: 'client', cacheKey, load, send, react, search, voice })
}
