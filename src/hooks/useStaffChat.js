import { useCallback, useEffect, useState } from 'react'
import { CHAT_FOLDER_CLIENTS } from '../lib/chat/chatContactsCore.js'
import {
  dictateStaffChat,
  fetchStaffChatContacts,
  fetchStaffChatThread,
  fetchStaffChats,
  fetchStaffDmThread,
  reactStaffChatMessage,
  reactStaffDmMessage,
  searchStaffChat,
  searchStaffDm,
  sendStaffChatMessage,
  sendStaffDmMessage,
} from '../lib/chat/staffChatApiClient.js'
import { useChatThread } from './useChatThread.js'

async function loadChatsAndFolders() {
  const { folders, role = '' } = await fetchStaffChatContacts()
  const list = folders ?? []
  if (role === 'admin' || list.some((f) => f.id === CHAT_FOLDER_CLIENTS)) return { folders: list, threads: [], role }
  const { threads } = await fetchStaffChats()
  return { folders: list, threads: threads ?? [], role }
}

/**
 * Папки сотрудника. У тренера «Клиенты» приходят папкой (все свои, с приложением сверху);
 * у остальных клиентская часть — прежний список диалогов (непрочитанные сверху).
 */
export function useStaffChats(enabled = true) {
  const [state, setState] = useState({ threads: null, folders: null, role: '', status: 'loading', error: '' })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    loadChatsAndFolders()
      .then(({ threads, folders, role }) => setState({ threads, folders, role, status: 'ready', error: '' }))
      .catch((e) => setState((s) => ({ ...s, status: 'error', error: e?.message || '' })))
  }, [])
  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])
  return { ...state, reload }
}

/** Лента переписки с коллегой / администрацией. */
export function useStaffDmThread(userId) {
  const load = useCallback((before, opts) => fetchStaffDmThread(userId, before, opts?.seen), [userId])
  const send = useCallback((outgoing) => sendStaffDmMessage(userId, outgoing), [userId])
  const react = useCallback((messageId, emoji) => reactStaffDmMessage(userId, messageId, emoji), [userId])
  const search = useCallback((q) => searchStaffDm(userId, q), [userId])
  return useChatThread({ key: `dm:${userId}`, side: 'staff', load, send, react, search, dictate: dictateStaffChat })
}

/** Лента диалога с клиентом. */
export function useStaffChatThread(clientId, kind) {
  const load = useCallback((before, opts) => fetchStaffChatThread(clientId, kind, before, opts?.seen), [clientId, kind])
  const send = useCallback((outgoing) => sendStaffChatMessage(clientId, kind, outgoing), [clientId, kind])
  const react = useCallback((messageId, emoji) => reactStaffChatMessage(clientId, kind, messageId, emoji), [clientId, kind])
  const search = useCallback((q) => searchStaffChat(clientId, kind, q), [clientId, kind])
  return useChatThread({ key: `${clientId}:${kind}`, side: 'staff', load, send, react, search, dictate: dictateStaffChat })
}
