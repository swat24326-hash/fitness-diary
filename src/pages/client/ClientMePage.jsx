import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { clientMeLeadCard } from '../../lib/client/clientMeHighlightsCore.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientMenu } from './ClientMenu.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { clientAttention } from './ClientTabs.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import {
  ClientLoyaltyCard,
  ClientMembershipNote,
  ClientMembershipsCard,
  ClientNextSessionCard,
  ClientStatsCard,
} from './ClientMeSections.jsx'
import { ClientProgressSection } from './ClientProgressSection.jsx'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientNotificationsEntry } from './ClientNotificationsEntry.jsx'
import { ClientOnboardingBanner } from './ClientOnboardingBanner.jsx'
import { ClientSignInPanel } from './ClientSignInPanel.jsx'
import { useClientMe } from './useClientMe.js'
import { useSparkRebuild } from './useSparkRebuild.js'
import { ClubStoryRail } from '../../components/stories/ClubStoryRail.jsx'

/** /me — приложение клиента: данные клуба; установка и напоминания — баннеры первого входа и меню. */
export function ClientMePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { onboarding } = useClientApp()
  const { data, savedAt, status, error, reload, logout } = useClientMe()
  const spark = useSparkRebuild(status, reload)
  const [progressPatch, setProgressPatch] = useState(null)
  const [addRequest, setAddRequest] = useState(/** @type {null | 'weight' | 'measure'} */ (null))
  const consumeAddRequest = useCallback(() => setAddRequest(null), [])
  useEffect(() => {
    setProgressPatch(null)
  }, [data])
  useEffect(() => {
    const kind = location.state?.clientProgressSelf
    if (kind !== 'weight' && kind !== 'measure') return
    setAddRequest(kind)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })
  }, [location.state, location.pathname, location.search, navigate])

  if (status === 'signed_out') {
    return (
      <ClientMeShell>
        <ClientSignInPanel
          error={error}
          onEntered={() => {
            onboarding.start()
            navigate(CLIENT_HOME, { replace: true, state: { clientQrIn: Date.now() } })
            reload()
          }}
        />
      </ClientMeShell>
    )
  }

  const actions = (
    <span className="client-me__actions">
      <ClientNotificationsEntry
        plans={data?.plans ?? readClientMeCache()?.data?.plans}
        ratings={data?.ratings ?? readClientMeCache()?.data?.ratings}
        membershipNotices={data?.membership_notices ?? readClientMeCache()?.data?.membership_notices}
        inboxAttention={data?.inbox_attention ?? readClientMeCache()?.data?.inbox_attention}
      />
      <ClientMenu
        clientName={data?.client?.name || ''}
        onRefresh={spark.refresh}
        refreshing={status === 'loading'}
        onLogout={() => void logout()}
        onAddWeight={() => setAddRequest('weight')}
        onAddMeasure={() => setAddRequest('measure')}
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
  const progress = progressPatch ?? data.progress
  return (
    <ClientMeShell actions={actions} club={data.club} tabs attention={clientAttention(data)}>
      <h1 className="sr-only">{data.client?.name || 'Мои тренировки'}</h1>
      {status === 'offline' ? (
        <p className="client-me-offline" role="status">
          Нет связи — показаны данные на {savedAt ? formatDateTimeRu(savedAt) : 'последнее обновление'}
        </p>
      ) : null}
      <ClientOnboardingBanner clubName={data.club?.name || ''} />
      <ClubStoryRail channel="client" />
      <ClientProgressSection
        progress={progress}
        asOf={today}
        sparkBuild={spark.build}
        sparkSettling={spark.settling}
        addRequest={addRequest}
        onAddRequestConsumed={consumeAddRequest}
        onProgressSaved={setProgressPatch}
      />
      <ClientStatsCard progress={progress} />
      <div className="client-me-tiles">
        {sessionFirst ? <ClientNextSessionCard session={data.next_session} today={today} lead /> : null}
        <ClientMembershipsCard memberships={data.memberships} today={today} lead={!sessionFirst} />
        {sessionFirst ? null : <ClientNextSessionCard session={data.next_session} today={today} />}
      </div>
      <ClientMembershipNote memberships={data.memberships} />
      <ClientLoyaltyCard loyalty={data.loyalty} memberships={data.memberships} />
    </ClientMeShell>
  )
}
