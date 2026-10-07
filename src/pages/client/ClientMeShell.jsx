import { useEffect } from 'react'
import { OsMark } from '../../components/brand/OsMark.jsx'
import { PRODUCT_BRAND_LOCKUP } from '../../lib/productBrand.js'

const CLIENT_MANIFEST = '/manifest-client.json'

/** Отдельный manifest: «Установить» с /me ставит приложение клиента, а не рабочее приложение зала. */
function useClientManifest() {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]')
    if (!link) return undefined
    const prev = link.getAttribute('href')
    link.setAttribute('href', CLIENT_MANIFEST)
    return () => {
      if (prev) link.setAttribute('href', prev)
    }
  }, [])
}

export function ClientMeShell({ children, actions = null }) {
  useClientManifest()
  return (
    <div className="client-me">
      <header className="client-me__top">
        <span className="client-me__brand">
          <OsMark size={22} />
          {PRODUCT_BRAND_LOCKUP}
        </span>
        {actions}
      </header>
      <main className="client-me__main">{children}</main>
    </div>
  )
}
