import { Link, useLocation } from 'react-router-dom'
import { legalLinkNavState } from '../../lib/legal/legalPageCloseCore.js'
import { CHAT_RULES_LINK_RU, CHAT_RULES_PATH } from '../../lib/legal/chatRulesCore.js'

/** Ссылка на правила переписки — сохраняет, куда вернуться крестиком. */
export function ChatRulesLink({ className = 'privacy-policy-link', fromProfile = false }) {
  const loc = useLocation()
  const state = legalLinkNavState({
    pathname: loc.pathname,
    search: loc.search,
    fromProfile,
  })
  return (
    <Link to={CHAT_RULES_PATH} state={state} className={className}>
      {CHAT_RULES_LINK_RU}
    </Link>
  )
}
