import { QrCode, RefreshCw, WifiOff } from 'lucide-react'
import { LegalEntryLinks } from '../../components/legal/LegalEntryLinks.jsx'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { clientMeLeadCard } from '../../lib/client/clientMeHighlightsCore.js'
import { ClientMenu } from './ClientMenu.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { clientAttention } from './ClientTabs.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import {
  ClientLoyaltyCard,
  ClientMembershipNote,
  ClientMembershipsCard,
  ClientNextSessionCard,
  ClientProgressCard,
  ClientStatsCard,
} from './ClientMeSections.jsx'
import { readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientNotificationsEntry } from './ClientNotificationsEntry.jsx'
import { ClientOnboardingBanner } from './ClientOnboardingBanner.jsx'
import { useClientMe } from './useClientMe.js'
import { useSparkRebuild } from './useSparkRebuild.js'

/** /me — приложение клиента: данные клуба; установка и напоминания — баннеры первого входа и меню. */
export function ClientMePage() {
  const { data, savedAt, status, error, reload, logout } = useClientMe()
  const spark = useSparkRebuild(status, reload)

  if (status === 'signed_out') {
    return (
      <ClientMeShell>
        <ClientMeStatus
          icon={QrCode}
          title="Вход по ссылке из клуба"
          hint={error || 'Попросите тренера или администратора показать QR-код в вашей карточке и отсканируйте его камерой.'}
        >
          <LegalEntryLinks />
        </ClientMeStatus>
      </ClientMeShell>
    )
  }

  const actions = (
    <span className="client-me__actions">
      <ClientNotificationsEntry
        plans={data?.plans ?? readClientMeCache()?.data?.plans}
        ratings={data?.ratings ?? readClientMeCache()?.data?.ratings}
      />
      <ClientMenu
        clientName={data?.client?.name || ''}
        onRefresh={spark.refresh}
        refreshing={status === 'loading'}
        onLogout={() => void logout()}
      />
    </span>
  )

  if (!data) {
    return (
      <ClientMeShell actions={actions} tabs>
        {status === 'offline' ? (
          <ClientMeStatus icon={WifiOff} title="Нет связи" hint={error} />
        ) : (
          <ClientMeStatus icon={RefreshCw} spin title="Загружаем…" />
        )}
      </ClientMeShell>
    )
  }

  const today = data.as_of
  const sessionFirst = clientMeLeadCard(data) === 'session'
  return (
    <ClientMeShell actions={actions} club={data.club} tabs attention={clientAttention(data)}>
      <h1 className="sr-only">{data.client?.name || 'Мои тренировки'}</h1>
      {status === 'offline' ? (
        <p className="client-me-offline" role="status">
          Нет связи — показаны данные на {savedAt ? formatDateTimeRu(savedAt) : 'последнее обновление'}
        </p>
      ) : null}
      <ClientOnboardingBanner clubName={data.club?.name || ''} />
      <ClientProgressCard
        progress={data.progress}
        sparkBuild={spark.build}
        sparkSettling={spark.settling}
      />
      <ClientStatsCard progress={data.progress} />
      <div className="client-me-tiles">
        {sessionFirst ? <ClientNextSessionCard session={data.next_session} today={today} lead /> : null}
        <ClientMembershipsCard memberships={data.memberships} today={today} lead={!sessionFirst} />
        {sessionFirst ? null : <ClientNextSessionCard session={data.next_session} today={today} />}
      </div>
      <ClientMembershipNote memberships={data.memberships} />
      <ClientLoyaltyCard loyalty={data.loyalty} />
    </ClientMeShell>
  )
}
