import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { ChatContactList } from '../../components/chat/ChatContactList.jsx'
import { ChatFoldersView } from '../../components/chat/ChatFoldersView.jsx'
import { ClientInviteModal } from '../../components/client/ClientInviteModal.jsx'
import { createCoachClientInvite, fetchCoachContacts } from '../../lib/coach/coachApiClient.js'
import { CHAT_FOLDER_CLIENTS, CHAT_FOLDER_COMPLAINTS } from '../../lib/chat/chatContactsCore.js'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState, CoachStatus } from './CoachStatus.jsx'
import { useCoachLoad } from './useCoachLoad.js'

const clientHref = (c) => `/coach/chat/${c.id}`
const complaintHref = (c) => `/coach/chat/${c.id}/supervisor`
const staffHref = (c) => `/coach/dm/${c.id}`

/**
 * «Сообщения»: папки «Клиенты · Коллеги · Администрация». В каждой все люди — с приложением ярко и сверху,
 * без — тускло (клиента можно пригласить, коллеге — всё равно написать).
 * Тренер, связанный с управляющим, видит ещё «Жалобы и предложения».
 */
export function CoachChatsPage() {
  const { data, status, error, reload } = useCoachLoad(fetchCoachContacts, { refreshOnReturn: true })
  const [inviting, setInviting] = useState(null)
  const folders = data?.folders ?? null

  let body
  if (!folders) body = <CoachLoadState status={status} error={error} onRetry={() => void reload()} />
  else if (!folders.length) {
    body = <CoachStatus icon={MessageCircle} title="Пока пусто" hint="Здесь появятся ваши клиенты и сообщения из приложения клуба." />
  } else {
    body = (
      <ChatFoldersView
        folders={folders.map((f) => {
          const clients = f.id === CHAT_FOLDER_CLIENTS
          const complaints = f.id === CHAT_FOLDER_COMPLAINTS
          return {
            ...f,
            node: (
              <ChatContactList
                contacts={f.contacts}
                kind={complaints ? 'supervisor' : 'trainer'}
                hrefFor={clients ? clientHref : complaints ? complaintHref : staffHref}
                onInvite={clients ? setInviting : undefined}
              />
            ),
          }
        })}
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
