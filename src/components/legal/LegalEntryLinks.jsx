import { ChatRulesLink } from './ChatRulesLink.jsx'
import { PrivacyPolicyLink } from './PrivacyPolicyLink.jsx'

/** Политика и правила переписки на экранах входа. */
export function LegalEntryLinks() {
  return (
    <p className="legal-entry-links">
      <PrivacyPolicyLink />
      <span className="legal-entry-links__sep" aria-hidden>
        ·
      </span>
      <ChatRulesLink />
    </p>
  )
}
