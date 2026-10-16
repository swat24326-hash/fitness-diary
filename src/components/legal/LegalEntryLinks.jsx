import { ChatRulesLink } from './ChatRulesLink.jsx'
import { PrivacyPolicyLink } from './PrivacyPolicyLink.jsx'

/**
 * Политика и правила переписки.
 * На входе — по центру; в «Мой профиль» — className с --in-profile (клиент сразу в /me без логина).
 */
export function LegalEntryLinks({ className = '' }) {
  const cls = ['legal-entry-links', className].filter(Boolean).join(' ')
  return (
    <p className={cls}>
      <PrivacyPolicyLink />
      <span className="legal-entry-links__sep" aria-hidden>
        ·
      </span>
      <ChatRulesLink />
    </p>
  )
}
