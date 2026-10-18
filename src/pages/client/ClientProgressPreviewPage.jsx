/**
 * DEV: вся главная /me с примером (без логина).
 * /me/home-preview и /me/progress-preview — одно и то же.
 */
import { Navigate } from 'react-router-dom'
import { clientMeLeadCard } from '../../lib/client/clientMeHighlightsCore.js'
import { clientMeHomePreviewSample } from '../../lib/client/clientMeProgressPreviewSample.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import {
  ClientLoyaltyCard,
  ClientMembershipNote,
  ClientMembershipsCard,
  ClientNextSessionCard,
  ClientProgressCard,
  ClientStatsCard,
} from './ClientMeSections.jsx'

function ClientHomePreviewBody() {
  const data = clientMeHomePreviewSample()
  const today = data.as_of
  const sessionFirst = clientMeLeadCard(data) === 'session'
  return (
    <>
      <p className="client-me-offline" role="note">
        Превью главной · только локально · без логина
      </p>
      <p className="client-me__hello">{data.client.name}</p>
      <ClientProgressCard progress={data.progress} />
      <ClientStatsCard progress={data.progress} />
      <div className="client-me-tiles">
        {sessionFirst ? <ClientNextSessionCard session={data.next_session} today={today} lead /> : null}
        <ClientMembershipsCard memberships={data.memberships} today={today} lead={!sessionFirst} />
        {sessionFirst ? null : <ClientNextSessionCard session={data.next_session} today={today} />}
      </div>
      <ClientMembershipNote memberships={data.memberships} />
      <ClientLoyaltyCard loyalty={data.loyalty} />
    </>
  )
}

export function ClientProgressPreviewPage() {
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  const data = clientMeHomePreviewSample()
  return (
    <ClientMeShell club={data.club} tabs>
      <ClientHomePreviewBody />
    </ClientMeShell>
  )
}

export function ClientHomePreviewPage() {
  return <ClientProgressPreviewPage />
}
