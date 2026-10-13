import { useState } from 'react'
import { Mail, MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatContactList } from '../../components/chat/ChatContactList.jsx'
import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { ClientInviteModal } from '../../components/client/ClientInviteModal.jsx'
import { InboxItemList } from '../../components/inbox/InboxItemList.jsx'
import { CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COMPLAINTS } from '../../lib/chat/chatContactsCore.js'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'
import { STAFF_FOLDER_INBOX } from '../../lib/chat/staffMessengerCore.js'

function Status({ icon: Icon, title, hint, spin = false }) {
  return (
    <div className="staff-msgr__status" role="status">
      <Icon size={24} aria-hidden className={spin ? 'icon-spin' : undefined} />
      <strong>{title}</strong>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  )
}

const loadingOrError = (status, error) =>
  status === 'error' ? (
    <Status icon={WifiOff} title="Не загрузилось" hint={error || 'Проверьте интернет и обновите.'} />
  ) : (
    <Status icon={RefreshCw} spin title="Загружаем…" />
  )

/**
 * Содержимое выбранной папки «Сообщений клуба»: люди, диалоги с клиентами или рассылки.
 * Строка ведёт в адрес мессенджера (справа откроется диалог), открытая — подсвечена.
 * @param {{ folder: { id: string, threads?: boolean, contacts?: object[] } | undefined, chats: object, inbox: object, open: object | null, href: (patch: object) => string }} props
 */
export function StaffMessengerList({ folder, chats, inbox, open, href }) {
  const [inviting, setInviting] = useState(null)
  const chatKey = open?.type === 'chat' ? `${open.clientId}:${open.kind}` : ''

  if (folder?.id === STAFF_FOLDER_INBOX) {
    if (!inbox.items) return loadingOrError(inbox.status, inbox.error)
    if (!inbox.items.length) return <Status icon={Mail} title="Пока пусто" hint="Здесь появятся объявления и опросы от руководства клуба." />
    return <InboxItemList items={inbox.items} hrefFor={(it) => href({ item: it.id })} selectedId={open?.type === 'item' ? open.id : ''} />
  }
  if (!chats.folders || !folder) return loadingOrError(chats.status, chats.error)

  if (folder.threads) {
    const threads = chats.threads ?? []
    if (!threads.length) return <Status icon={MessageCircle} title="Пока пусто" hint="Здесь появятся сообщения клиентов из приложения клуба." />
    const rows = threads.map((t) => ({
      key: `${t.client_id}:${t.kind}`,
      to: href({ chat: `${t.client_id}:${t.kind}` }),
      selected: chatKey === `${t.client_id}:${t.kind}`,
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

  const contacts = folder.contacts ?? []
  if (folder.id === CHAT_FOLDER_CLIENTS) {
    return (
      <>
        <ChatContactList
          contacts={contacts}
          kind="trainer"
          hrefFor={(c) => href({ chat: `${c.id}:trainer` })}
          onInvite={setInviting}
          selectedId={chatKey.endsWith(':trainer') ? open.clientId : ''}
        />
        <ClientInviteModal open={Boolean(inviting)} client={inviting ?? { id: '' }} onClose={() => setInviting(null)} />
      </>
    )
  }
  if (folder.id === CHAT_FOLDER_COMPLAINTS) {
    return (
      <ChatContactList
        contacts={contacts}
        kind="supervisor"
        hrefFor={(c) => href({ chat: `${c.id}:supervisor` })}
        selectedId={chatKey.endsWith(':supervisor') ? open.clientId : ''}
      />
    )
  }
  return <ChatContactList contacts={contacts} kind="trainer" hrefFor={(c) => href({ dm: c.id })} selectedId={open?.type === 'dm' ? open.userId : ''} />
}
