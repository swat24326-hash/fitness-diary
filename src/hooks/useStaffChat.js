import { useCallback, useEffect, useState } from 'react'
import { CHAT_FOLDER_CLIENTS } from '../lib/chat/chatContactsCore.js'
import {
  fetchStaffChatContacts,
  fetchStaffChatThread,
  fetchStaffChats,
  fetchStaffDmThread,
  sendStaffChatMessage,
  sendStaffDmMessage,
} from '../lib/chat/staffChatApiClient.js'
import { useChatThread } from './useChatThread.js'

async function loadChatsAndFolders() {
  const { folders } = await fetchStaffChatContacts()
  const list = folders ?? []
  if (list.some((f) => f.id === CHAT_FOLDER_CLIENTS)) return { folders: list, threads: [] }
  const { threads } = await fetchStaffChats()
  return { folders: list, threads: threads ?? [] }
}

/**
 * Папки сотрудника. У тренера «Клиенты» приходят папкой (все свои, с приложением сверху);
 * у остальных клиентская часть — прежний список диалогов (непрочитанные сверху).
 */
export function useStaffChats(enabled = true) {
  const [state, setState] = useState({ threads: null, folders: null, status: 'loading', error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    loadChatsAndFolders()
      .then(({ threads, folders }) => setState({ threads, folders, status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: 'error', error: e?.message || '' })))
  }, [])
  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])
  return { ...state, reload }
}

/** Лента переписки с коллегой / администрацией. */
export function useStaffDmThread(userId) {
  const load = useCallback((before) => fetchStaffDmThread(userId, before), [userId])
  const send = useCallback((outgoing) => sendStaffDmMessage(userId, outgoing), [userId])
  return useChatThread({ key: `dm:${userId}`, side: 'staff', load, send })
}

/** Лента диалога с клиентом. */
export function useStaffChatThread(clientId, kind) {
  const load = useCallback((before) => fetchStaffChatThread(clientId, kind, before), [clientId, kind])
  const send = useCallback((outgoing) => sendStaffChatMessage(clientId, kind, outgoing), [clientId, kind])
  return useChatThread({ key: `${clientId}:${kind}`, side: 'staff', load, send })
}
