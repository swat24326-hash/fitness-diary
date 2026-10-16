import { Link, Navigate } from 'react-router-dom'
import { Bell, ChevronRight, ClipboardList, Gift, Megaphone, Salad, Star } from 'lucide-react'
import { CLIENT_NOTIFICATION_KINDS, buildClientNotifications } from '../../lib/client/clientNotificationsCore.js'
import { inboxPointsLineRu } from '../../lib/client/clientInboxUiCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientInbox } from './useClientInbox.js'
import { useClientMe } from './useClientMe.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

function NotifIcon({ kind }) {
  if (kind === CLIENT_NOTIFICATION_KINDS.nutrition_sent) return <Salad size={20} />
  if (kind === CLIENT_NOTIFICATION_KINDS.club_survey || kind === CLIENT_NOTIFICATION_KINDS.club_notice) {
    return <Megaphone size={20} />
  }
  if (
    kind === CLIENT_NOTIFICATION_KINDS.rate_membership ||
    kind === CLIENT_NOTIFICATION_KINDS.rate_homework ||
    kind === CLIENT_NOTIFICATION_KINDS.rate_nutrition
  ) {
    return <Star size={20} />
  }
  return <ClipboardList size={20} />
}

/** /me/notifications — одна лента: ДЗ, рацион, оценки, опросы и объявления клуба. */
export function ClientNotificationsPage() {
  const { data, status, error, reload: reloadMe } = useClientMe()
  const inbox = useClientInbox()
  if (!hasClientSession() || status === 'signed_out' || inbox.status === 'signed_out') {
    return <Navigate to={CLIENT_HOME} replace />
  }

  const items = buildClientNotifications(data?.plans, data?.ratings, { inboxItems: inbox.items ?? [] })
  const club = data?.club ?? readClientMeCache()?.data?.club ?? null
  const pointsLine = inboxPointsLineRu(inbox.points)
  const loading = (!data && status === 'loading') || (inbox.items == null && inbox.status === 'loading')

  let list
  if (loading && !items.length) {
    list = <ClientMeStatus title="Загружаем…" />
  } else if (!items.length) {
    list = (
      <ClientMeStatus
        icon={Bell}
        title="Пока тихо"
        hint="Здесь появятся задание, рацион, просьба оценить и объявления клуба. Переписка — во вкладке «Сообщения»."
      />
    )
  } else {
    list = (
      <ol className="client-inbox" data-testid="client-notifications-feed">
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
      actions={
        <ClientPageActions
          onRefresh={() => {
            reloadMe()
            inbox.reload()
          }}
          refreshing={status === 'loading' || inbox.status === 'loading'}
        />
      }
      club={club}
      tabs
    >
      <ClientPageTitle title="Уведомления" />
      {status === 'offline' && error ? (
        <p className="client-me-offline" role="status">
          {error}
        </p>
      ) : null}
      {inbox.items && inbox.status === 'error' ? (
        <p className="client-me-offline" role="alert">
          {inbox.error}
        </p>
      ) : null}
      {pointsLine ? (
        <p className="client-inbox__points" data-testid="client-inbox-points">
          <Gift size={18} aria-hidden />
          <span>{pointsLine}</span>
        </p>
      ) : null}
      {list}
    </ClientMeShell>
  )
}
