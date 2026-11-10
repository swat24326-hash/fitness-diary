import { Navigate } from 'react-router-dom'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientSettingsSection } from './ClientSettingsSection.jsx'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

/** /me/settings — старые ссылки; в меню настройки теперь в «Мой профиль» (ClientSettingsSection). */
export function ClientSettingsPage() {
  if (!hasClientSession()) return <Navigate to={CLIENT_HOME} replace />
  const cached = readClientMeCache()?.data
  const club = cached?.club ?? null
  return (
    <ClientMeShell actions={<ClientPageActions />} club={club}>
      <ClientPageTitle title="Настройки" />
      <ClientSettingsSection
        asOf={cached?.as_of || ''}
        sex={cached?.client?.sex ?? null}
        cycle={cached?.cycle ?? null}
      />
    </ClientMeShell>
  )
}
