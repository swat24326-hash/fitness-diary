import { OsMark } from '../../components/brand/OsMark.jsx'
import { withHandoffManifest } from '../../lib/client/clientHandoffCore.js'
import { PRODUCT_BRAND_NAME_PREPOSITIONAL } from '../../lib/productBrand.js'
import { useClientApp } from './ClientAppContext.jsx'
import { useClientBranding } from './useClientBranding.js'

/** Шапка — клуб клиента; продукт только мелко внизу. */
export function ClientMeShell({ children, actions = null, club = null }) {
  const clubName = club?.name || ''
  const { handoffToken } = useClientApp()
  useClientBranding(clubName, withHandoffManifest(club?.manifest_url || null, handoffToken))
  return (
    <div className="client-me">
      <header className="client-me__top">
        <span className="client-me__brand">{clubName || 'Мои тренировки'}</span>
        {actions}
      </header>
      <main className="client-me__main">{children}</main>
      <footer className="client-me__powered">
        <OsMark size={14} />
        работает на {PRODUCT_BRAND_NAME_PREPOSITIONAL}
      </footer>
    </div>
  )
}
