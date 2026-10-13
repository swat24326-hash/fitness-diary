import { useCallback, useEffect, useState } from 'react'
import {
  dictateClientChat,
  fetchClientChatThread,
  fetchClientChats,
  reactClientChatMessage,
  searchClientChat,
  sendClientChatMessage,
} from '../../lib/client/clientChatService.js'
import { ClientSessionGoneError } from '../../lib/client/clientSession.js'
import { useChatThread } from '../../hooks/useChatThread.js'

/** Три диалога клиента для экрана «Сообщения». */
export function useClientChats() {
  const [state, setState] = useState({ threads: null, status: 'loading', error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchClientChats()
      .then(({ threads }) => setState({ threads, status: 'ready', error: '' }))
      .catch((e) =>
        setState((s) => ({ ...s, status: e instanceof ClientSessionGoneError ? 'signed_out' : 'error', error: e?.message || '' })),
      )
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

/** Лента одного диалога клиента. */
export function useClientChatThread(kind) {
  const load = useCallback((before, opts) => fetchClientChatThread(kind, before, opts?.seen), [kind])
  const send = useCallback((outgoing) => sendClientChatMessage(kind, outgoing), [kind])
  const react = useCallback((messageId, emoji) => reactClientChatMessage(kind, messageId, emoji), [kind])
  const search = useCallback((q) => searchClientChat(kind, q), [kind])
  return useChatThread({ key: kind, side: 'client', load, send, react, search, dictate: dictateClientChat })
}
