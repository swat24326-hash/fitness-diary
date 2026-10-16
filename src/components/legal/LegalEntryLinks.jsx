import { ChatRulesLink } from './ChatRulesLink.jsx'
import { PrivacyPolicyLink } from './PrivacyPolicyLink.jsx'

/**
 * Политика и правила переписки.
 * fromProfile / --in-profile — после крестика снова открыть «Мой профиль».
 */
export function LegalEntryLinks({ className = '', fromProfile = false }) {
  const inProfile = fromProfile || /\blegal-entry-links--in-profile\b/.test(className)
  const cls = ['legal-entry-links', className].filter(Boolean).join(' ')
  return (
    <p className={cls}>
      <PrivacyPolicyLink className="legal-entry-links__a" fromProfile={inProfile} />
      <span className="legal-entry-links__sep" aria-hidden>
        ·
      </span>
      <ChatRulesLink className="legal-entry-links__a" fromProfile={inProfile} />
    </p>
  )
}
