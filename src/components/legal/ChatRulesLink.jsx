import { Link } from 'react-router-dom'
import { CHAT_RULES_LINK_RU, CHAT_RULES_PATH } from '../../lib/legal/chatRulesCore.js'

/** Ссылка на правила переписки — рядом с политикой на входах. */
export function ChatRulesLink({ className = 'privacy-policy-link' }) {
  return (
    <Link to={CHAT_RULES_PATH} className={className}>
      {CHAT_RULES_LINK_RU}
    </Link>
  )
}
