import { Link } from 'react-router-dom'
import {
  CHAT_RULES_TITLE,
  CHAT_RULES_UPDATED,
  chatRulesSections,
} from '../../lib/legal/chatRulesCore.js'
import { PRIVACY_POLICY_LINK_RU, PRIVACY_POLICY_PATH } from '../../lib/legal/privacyPolicyCore.js'
import { PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'
import { formatDateRu } from '../../lib/dateRu.js'

/** Публичные правила переписки клуба — без входа. */
export function ChatRulesPage() {
  const updated = formatDateRu(CHAT_RULES_UPDATED) || CHAT_RULES_UPDATED

  return (
    <main className="privacy-policy">
      <header className="privacy-policy__head">
        <p className="privacy-policy__brand muted">{PRODUCT_BRAND_NAME}</p>
        <h1 className="privacy-policy__title">{CHAT_RULES_TITLE}</h1>
        <p className="privacy-policy__meta muted">Обновлено {updated}</p>
      </header>

      <p className="privacy-policy__lead">
        Краткие правила общения в мессенджере клуба внутри «{PRODUCT_BRAND_NAME}». Это не договор и не политика
        персональных данных —{' '}
        <Link to={PRIVACY_POLICY_PATH}>{PRIVACY_POLICY_LINK_RU}</Link>.
      </p>

      {chatRulesSections().map((s) => (
        <section key={s.id} id={s.id} className="privacy-policy__section">
          <h2 className="privacy-policy__h2">{s.title}</h2>
          <p className="privacy-policy__body">{s.body}</p>
        </section>
      ))}

      <p className="privacy-policy__back">
        <Link to={PRIVACY_POLICY_PATH}>{PRIVACY_POLICY_LINK_RU}</Link>
        {' · '}
        <Link to="/login">Ко входу сотрудников</Link>
        {' · '}
        <Link to="/me">В приложение клиента</Link>
        {' · '}
        <Link to="/coach">В приложение тренера</Link>
      </p>
    </main>
  )
}
