import { useState } from 'react'
import { MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatContactList } from '../../components/chat/ChatContactList.jsx'
import { ChatFoldersView } from '../../components/chat/ChatFoldersView.jsx'
import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { ClientInviteModal } from '../../components/client/ClientInviteModal.jsx'
import { CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COMPLAINTS, chatFolderLabelRu } from '../../lib/chat/chatContactsCore.js'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'

function Status({ icon: Icon, title, hint, spin = false }) {
  return (
    <div className="card staff-inbox__status" role="status">
      <Icon size={28} aria-hidden className={spin ? 'icon-spin' : undefined} />
      <strong>{title}</strong>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  )
}

const EMPTY_HINT = 'Здесь появятся сообщения клиентов из приложения клуба.'
const clientHref = (c) => `/messages/chat/${c.id}/trainer`
const complaintHref = (c) => `/messages/chat/${c.id}/supervisor`
const staffHref = (c) => `/messages/dm/${c.id}`

function ThreadList({ threads }) {
  if (!threads.length) return <Status icon={MessageCircle} title="Пока пусто" hint={EMPTY_HINT} />
  const rows = threads.map((t) => ({
    key: `${t.client_id}:${t.kind}`,
    to: `/messages/chat/${t.client_id}/${t.kind}`,
    kind: t.kind,
    title: t.kind === 'trainer' ? t.client_name : `${t.client_name} · ${t.label}`,
    preview: chatThreadPreviewRu(t, 'staff'),
    avatar: t.client_name,
    unread: t.unread,
    unreadCount: t.unread_count,
    at: t.last_message_at,
    reaction: t.reaction,
  }))
  return <ChatThreadList rows={rows} />
}

/**
 * Вкладка «Диалоги» в /messages: папки «Клиенты · Коллеги/Тренеры · Администрация»
 * (+ «Жалобы и предложения» у тренера, связанного с управляющим).
 * У тренера «Клиенты» — все свои, с приложением сверху, тусклого можно пригласить;
 * у менеджера и управляющего «Клиенты» — список диалогов, непрочитанные сверху;
 * у главного админа своя страница — AdminMessenger (клубы · люди · диалог).
 * @param {ReturnType<typeof import('../../hooks/useStaffChat.js').useStaffChats>} props
 */
export function StaffChatList({ threads, folders, role, status, error }) {
  const [inviting, setInviting] = useState(null)
  if (!folders) {
    return status === 'error' ? (
      <Status icon={WifiOff} title="Не загрузилось" hint={error || 'Проверьте интернет и обновите.'} />
    ) : (
      <Status icon={RefreshCw} spin title="Загружаем…" />
    )
  }
  if (!folders.length) return <ThreadList threads={threads ?? []} />
  const views = folders.map((f) => ({
    ...f,
    node:
      f.id === CHAT_FOLDER_CLIENTS ? (
        <ChatContactList contacts={f.contacts} kind="trainer" hrefFor={clientHref} onInvite={setInviting} />
      ) : f.id === CHAT_FOLDER_COMPLAINTS ? (
        <ChatContactList contacts={f.contacts} kind="supervisor" hrefFor={complaintHref} />
      ) : (
        <ChatContactList contacts={f.contacts} kind="trainer" hrefFor={staffHref} />
      ),
  }))
  if (role !== 'admin' && !folders.some((f) => f.id === CHAT_FOLDER_CLIENTS)) {
    const list = threads ?? []
    views.unshift({
      id: CHAT_FOLDER_CLIENTS,
      label: chatFolderLabelRu(CHAT_FOLDER_CLIENTS),
      unread: list.filter((t) => t.unread).length,
      node: <ThreadList threads={list} />,
    })
  }
  return (
    <>
      <ChatFoldersView folders={views} />
      <ClientInviteModal open={Boolean(inviting)} client={inviting ?? { id: '' }} onClose={() => setInviting(null)} />
    </>
  )
}
