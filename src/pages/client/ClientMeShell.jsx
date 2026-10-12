import { APP_BRAND_NAME } from '../../lib/appBrand.js'
import { withHandoffManifest } from '../../lib/client/clientHandoffCore.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientTabs } from './ClientTabs.jsx'
import { useClientBranding } from './useClientBranding.js'

/**
 * Шапка — клуб клиента (без клуба — название приложения).
 * tabs — нижние вкладки (вход, диалог и сообщение — без них, у них своя «Назад»).
 */
export function ClientMeShell({ children, actions = null, club = null, tabs = false, attention }) {
  const clubName = club?.name || ''
  const { handoffToken } = useClientApp()
  useClientBranding(clubName, withHandoffManifest(club?.manifest_url || null, handoffToken))
  return (
    <div className={`client-me${tabs ? ' client-me--tabs' : ''}`}>
      <header className="client-me__top">
        <span className="client-me__brand">{clubName || APP_BRAND_NAME}</span>
        {actions}
      </header>
      <main className="client-me__main">{children}</main>
      {tabs ? <ClientTabs attention={attention} /> : null}
    </div>
  )
}
