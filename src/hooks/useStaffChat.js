import { useCallback, useEffect, useState } from 'react'
import { fetchStaffChatThread, fetchStaffChats, sendStaffChatMessage } from '../lib/chat/staffChatApiClient.js'
import { useChatThread } from './useChatThread.js'

/** Список диалогов сотрудника (непрочитанные сверху). */
export function useStaffChats(enabled = true) {
  const [state, setState] = useState({ threads: null, status: 'loading', error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchStaffChats()
      .then(({ threads }) => setState({ threads: threads ?? [], status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: 'error', error: e?.message || '' })))
  }, [])
  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])
  return { ...state, reload }
}

/** Лента диалога с клиентом. */
export function useStaffChatThread(clientId, kind) {
  const load = useCallback((before) => fetchStaffChatThread(clientId, kind, before), [clientId, kind])
  const send = useCallback((outgoing) => sendStaffChatMessage(clientId, kind, outgoing), [clientId, kind])
  return useChatThread({ key: `${clientId}:${kind}`, side: 'staff', load, send })
}
