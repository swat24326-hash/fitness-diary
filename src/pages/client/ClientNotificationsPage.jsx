import { Link, Navigate } from 'react-router-dom'
import { Bell, ChevronRight, ClipboardList, Salad, Star } from 'lucide-react'
import { CLIENT_NOTIFICATION_KINDS, buildClientNotifications } from '../../lib/client/clientNotificationsCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientMe } from './useClientMe.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

function NotifIcon({ kind }) {
  if (kind === CLIENT_NOTIFICATION_KINDS.nutrition_sent) return <Salad size={20} />
  if (
    kind === CLIENT_NOTIFICATION_KINDS.rate_membership ||
    kind === CLIENT_NOTIFICATION_KINDS.rate_homework ||
    kind === CLIENT_NOTIFICATION_KINDS.rate_nutrition
  ) {
    return <Star size={20} />
  }
  return <ClipboardList size={20} />
}

/** /me/notifications — персональные события (ДЗ, рацион, оценка). Не путать с «Сообщениями». */
export function ClientNotificationsPage() {
  const { data, status, error, reload } = useClientMe()
  if (!hasClientSession() || status === 'signed_out') return <Navigate to={CLIENT_HOME} replace />

  const items = buildClientNotifications(data?.plans, data?.ratings)
  const club = data?.club ?? readClientMeCache()?.data?.club ?? null

  let list
  if (!data && status === 'loading') {
    list = <ClientMeStatus title="Загружаем…" />
  } else if (!items.length) {
    list = (
      <ClientMeStatus
        icon={Bell}
        title="Пока тихо"
        hint="Здесь появятся задание, рацион и просьба оценить тренировки. Сообщения клуба — во вкладке «Сообщения»."
      />
    )
  } else {
    list = (
      <ol className="client-inbox">
        {items.map((it, i) => {
          const fresh = !it.read_at
          return (
            <li key={it.id} style={{ '--i': i }}>
              <Link
                to={it.deep_link}
                className={`client-inbox__row${fresh ? ' client-inbox__row--new' : ''}`}
              >
                <span className="client-inbox__icon" aria-hidden>
                  <NotifIcon kind={it.kind} />
                </span>
                <span className="client-inbox__body">
                  <strong>{it.title}</strong>
                  <small>{it.body}</small>
                </span>
                {fresh ? <span className="client-inbox__dot" aria-label="Новое" /> : null}
                <ChevronRight size={18} className="client-inbox__go" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <ClientMeShell
      actions={<ClientPageActions onRefresh={reload} refreshing={status === 'loading'} />}
      club={club}
      tabs
    >
      <ClientPageTitle title="Уведомления" />
      {status === 'offline' && error ? (
        <p className="client-me-offline" role="status">
          {error}
        </p>
      ) : null}
      {list}
    </ClientMeShell>
  )
}
