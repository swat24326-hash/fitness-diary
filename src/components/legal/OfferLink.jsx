import { Link, useLocation } from 'react-router-dom'
import { legalLinkNavState } from '../../lib/legal/legalPageCloseCore.js'
import { OFFER_LINK_RU, OFFER_PATH } from '../../lib/legal/offerCore.js'

/** Ссылка на оферту — сохраняет, куда вернуться крестиком (без новой вкладки). */
export function OfferLink({ className = 'privacy-policy-link', fromProfile = false, children = null }) {
  const loc = useLocation()
  const state = legalLinkNavState({
    pathname: loc.pathname,
    search: loc.search,
    fromProfile,
  })
  return (
    <Link to={OFFER_PATH} state={state} className={className}>
      {children ?? OFFER_LINK_RU}
    </Link>
  )
}
