import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { ChatContactList } from '../../components/chat/ChatContactList.jsx'
import { ChatFolders } from '../../components/chat/ChatFolders.jsx'
import { MessengerLayout } from '../../components/chat/MessengerLayout.jsx'
import { StaffGroupRow } from '../../components/chat/StaffGroupRow.jsx'
import { ClientInviteModal } from '../../components/client/ClientInviteModal.jsx'
import { useSavedChatFolder } from '../../hooks/useSavedChatFolder.js'
import { createCoachClientInvite, fetchCoachContacts } from '../../lib/coach/coachApiClient.js'
import { CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COMPLAINTS } from '../../lib/chat/chatContactsCore.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState, CoachStatus } from './CoachStatus.jsx'
import { useCoachLoad } from './useCoachLoad.js'

const CONTACTS_CACHE = screenCacheKey('coach', 'contacts')
const clientHref = (c) => `/coach/chat/${c.id}`
const complaintHref = (c) => `/coach/chat/${c.id}/supervisor`
const staffHref = (c) => `/coach/dm/${c.id}`

/**
 * «Сообщения» телефона тренера: папки «Клиенты · Коллеги · Администрация» (у связанного с управляющим —
 * ещё «Жалобы и предложения») и список. Рамка — общая с планшетом и админом (MessengerLayout, одна панель),
 * диалог открывается своей страницей /coach/chat|dm/:id.
 */
export function CoachChatsPage() {
  const { data, status, error, reload } = useCoachLoad(fetchCoachContacts, { refreshOnReturn: true, cacheKey: CONTACTS_CACHE })
  const [inviting, setInviting] = useState(null)
  const [saved, pick] = useSavedChatFolder()
  const folders = data?.folders ?? null

  let body
  if (!folders) body = <CoachLoadState status={status} error={error} onRetry={() => void reload()} />
  else if (!folders.length) {
    body = <CoachStatus icon={MessageCircle} title="Пока пусто" hint="Здесь появятся ваши клиенты и сообщения из приложения клуба." />
  } else {
    const active = folders.find((f) => f.id === saved) ?? folders[0]
    const clients = active.id === CHAT_FOLDER_CLIENTS
    const complaints = active.id === CHAT_FOLDER_COMPLAINTS
    body = (
      <MessengerLayout
        compact
        open={false}
        listLabel="Диалоги"
        folders={<ChatFolders folders={folders} active={active.id} onChange={pick} />}
        list={
          <ChatContactList
            key={active.id}
            contacts={active.contacts}
            kind={complaints ? 'supervisor' : 'trainer'}
            hrefFor={clients ? clientHref : complaints ? complaintHref : staffHref}
            onInvite={clients ? setInviting : undefined}
            pinned={active.group ? <StaffGroupRow group={active.group} to="/coach/group" /> : null}
          />
        }
      />
    )
  }
  return (
    <CoachShell title="Сообщения">
      {body}
      <ClientInviteModal
        open={Boolean(inviting)}
        client={inviting ?? { id: '' }}
        onClose={() => setInviting(null)}
        createInvite={createCoachClientInvite}
        revokeAccess={null}
      />
    </CoachShell>
  )
}
