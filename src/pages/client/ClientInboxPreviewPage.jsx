/**
 * DEV: вкладка «Сообщения» без логина.
 * /me/inbox-preview — ПЗ (тренер + менеджер + жалобы)
 * /me/inbox-preview?az=1 — чистый АЗ (инструкторы + менеджер + жалобы, без «Тренер»)
 */
import { Navigate, useSearchParams } from 'react-router-dom'
import { buildClientChatDialogs } from '../../lib/chat/clientAzChatCore.js'
import { ClientChatThreadsSection } from './ClientChatThreadsSection.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'

const SAMPLE = {
  trainer: {
    last_preview: 'Завтра в 13:00 — не опаздывайте',
    last_author: 'staff',
    last_message_at: '2026-10-29T18:00:00.000Z',
    unread: false,
    unread_count: 0,
  },
  sales: {
    last_preview: 'Абонемент можно продлить на стойке',
    last_author: 'staff',
    last_message_at: '2026-10-28T12:00:00.000Z',
    unread: true,
    unread_count: 1,
  },
  supervisor: {
    last_preview: '',
    last_author: null,
    last_message_at: null,
    unread: false,
    unread_count: 0,
  },
}

const AZ_SAMPLE = {
  'az_instructor:inst-box': {
    last_preview: 'В четверг группа в 19:00',
    last_author: 'staff',
    last_message_at: '2026-10-29T16:00:00.000Z',
    unread: true,
    unread_count: 2,
  },
  'az_instructor:inst-step': {
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
  const dialogs = buildClientChatDialogs({
    client,
    azInstructors: pureAz
      ? [
          { instructor_id: 'inst-box', direction_type_id: 'dir-box' },
          { instructor_id: 'inst-step', direction_type_id: 'dir-step' },
        ]
      : [],
    instructorNameById: { 'inst-box': 'Олег', 'inst-step': 'Наташа' },
    directionNameById: { 'dir-box': 'Бокс', 'dir-step': 'Степ' },
  })
  const threads = dialogs.map((d) => {
    const key = d.peer_user_id ? `${d.kind}:${d.peer_user_id}` : d.kind
    const sample = AZ_SAMPLE[key] || SAMPLE[d.kind] || {}
    return {
      ...d,
      ...sample,
      name: d.name || (d.kind === 'trainer' ? 'Марина Попова' : ''),
    }
  })

  return (
    <ClientMeShell tabs showFromTrainer={!pureAz} club={{ name: 'FIT-CITY' }}>
      <p className="client-me-offline" role="note">
        {pureAz
          ? 'Превью «Сообщения» · чистый АЗ · инструкторы + клуб · макет'
          : 'Превью «Сообщения» · ПЗ · локально · без логина'}
      </p>
      <ClientPageTitle title="Сообщения" back={false} />
      <ClientChatThreadsSection threads={threads} />
    </ClientMeShell>
  )
}
