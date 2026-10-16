import { Link } from 'react-router-dom'
import { PRIVACY_POLICY_LINK_RU, PRIVACY_POLICY_PATH } from '../../lib/legal/privacyPolicyCore.js'

/** Ссылка на политику — на экранах входа (/login, /me, /coach). */
export function PrivacyPolicyLink({ className = 'privacy-policy-link' }) {
  return (
    <Link to={PRIVACY_POLICY_PATH} className={className}>
      {PRIVACY_POLICY_LINK_RU}
    </Link>
  )
}
