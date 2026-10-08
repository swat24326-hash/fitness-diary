import { Navigate, useParams } from 'react-router-dom'
import { CheckCircle2, Lock, RefreshCw, WifiOff } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { inboxItemMetaRu, inboxThanksRu } from '../../lib/client/clientInboxUiCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientBackActions } from './ClientBackActions.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { InboxSurveyForm } from '../../components/inbox/InboxSurveyForm.jsx'
import { useClientInboxItem } from './useClientInbox.js'

/** /me/inbox/:id — объявление целиком или опрос (форма → «Спасибо»). */
export function ClientInboxItemPage() {
  const { id = '' } = useParams()
  const { item, status, error, reload, answer, sending, sendError } = useClientInboxItem(id)
  if (!hasClientSession() || status === 'signed_out') return <Navigate to="/me" replace />
  const club = readClientMeCache()?.data?.club ?? null
  const actions = <ClientBackActions to="/me/inbox" />

  if (!item) {
    return (
      <ClientMeShell actions={actions} club={club}>
        {status === 'error' ? (
          <ClientMeStatus icon={WifiOff} title="Не открылось" hint={error}>
            <button type="button" className="btn btn-secondary btn-touch" onClick={reload}>
              Повторить
            </button>
          </ClientMeStatus>
        ) : (
          <ClientMeStatus icon={RefreshCw} spin title="Открываем…" />
        )}
      </ClientMeShell>
    )
  }

  const survey = item.kind === 'survey'
  return (
    <ClientMeShell actions={actions} club={club}>
      <header className="client-inbox-item__head">
        <small className="client-me-muted">
          {inboxItemMetaRu(item)} · {formatDateTimeRu(item.sent_at)}
        </small>
        <h1 className="client-me__hello">{item.title}</h1>
      </header>
      {item.body ? <p className="client-me-card client-inbox-item__body">{item.body}</p> : null}
      {survey && item.status === 'answered' ? (
        <section className="client-me-card client-inbox-item__done" role="status">
          <CheckCircle2 size={22} aria-hidden />
          <span>{inboxThanksRu(item)}</span>
        </section>
      ) : null}
      {survey && item.status !== 'answered' && !item.open ? (
        <ClientMeStatus icon={Lock} title="Опрос закрыт" hint="Срок ответа вышел — спасибо, что заглянули." />
      ) : null}
      {survey && (item.status === 'answered' || item.open) ? (
        <InboxSurveyForm
          key={item.status}
          questions={item.questions ?? []}
          initial={item.answers}
          readOnly={item.status === 'answered'}
          sending={sending}
          error={sendError}
          onSubmit={(a) => void answer(a)}
        />
      ) : null}
    </ClientMeShell>
  )
}
