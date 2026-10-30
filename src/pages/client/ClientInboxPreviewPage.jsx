/**
 * DEV: вкладка «Сообщения» без логина.
 * /me/inbox-preview — ПЗ (тренер + менеджер + жалобы)
 * /me/inbox-preview?az=1 — чистый АЗ (без диалога «Тренер»)
 */
import { Navigate, useSearchParams } from 'react-router-dom'
import { clientChatKinds } from '../../lib/chat/chatAccessCore.js'
import { ClientChatThreadsSection } from './ClientChatThreadsSection.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'

const SAMPLE = {
  trainer: {
    kind: 'trainer',
    name: 'Марина Попова',
    last_preview: 'Завтра в 13:00 — не опаздывайте',
    last_author: 'staff',
    last_message_at: '2026-10-29T18:00:00.000Z',
    unread: false,
    unread_count: 0,
  },
  sales: {
    kind: 'sales',
    name: null,
    last_preview: 'Абонемент можно продлить на стойке',
    last_author: 'staff',
    last_message_at: '2026-10-28T12:00:00.000Z',
    unread: true,
    unread_count: 1,
  },
  supervisor: {
    kind: 'supervisor',
    name: null,
    last_preview: '',
    last_author: null,
    last_message_at: null,
    unread: false,
    unread_count: 0,
  },
}

export function ClientInboxPreviewPage() {
  const [params] = useSearchParams()
  const pureAz = params.get('az') === '1'
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />

  const client = pureAz ? { trainer_id: null } : { trainer_id: 'tr1' }
  const kinds = clientChatKinds(client)
  const threads = kinds.map((k) => SAMPLE[k])

  return (
    <ClientMeShell tabs club={{ name: 'FIT-CITY' }}>
      <p className="client-me-offline" role="note">
        {pureAz
          ? 'Превью «Сообщения» · чистый АЗ · без диалога с тренером · макет'
          : 'Превью «Сообщения» · ПЗ · локально · без логина'}
      </p>
      <ClientPageTitle title="Сообщения" back={false} />
      <ClientChatThreadsSection threads={threads} />
    </ClientMeShell>
  )
}
