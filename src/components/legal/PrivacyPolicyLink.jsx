import { Link, useLocation } from 'react-router-dom'
import { legalLinkNavState } from '../../lib/legal/legalPageCloseCore.js'
import { PRIVACY_POLICY_LINK_RU, PRIVACY_POLICY_PATH } from '../../lib/legal/privacyPolicyCore.js'

/** Ссылка на политику — сохраняет, куда вернуться крестиком. */
export function PrivacyPolicyLink({ className = 'privacy-policy-link', fromProfile = false }) {
  const loc = useLocation()
  const state = legalLinkNavState({
    pathname: loc.pathname,
    search: loc.search,
    fromProfile,
  })
  return (
    <Link to={PRIVACY_POLICY_PATH} state={state} className={className}>
      {PRIVACY_POLICY_LINK_RU}
    </Link>
  )
}
