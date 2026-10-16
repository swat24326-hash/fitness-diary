import { Link } from 'react-router-dom'
import { OFFER_LINK_RU, OFFER_PATH } from '../../lib/legal/offerCore.js'
import {
  CHAT_RULES_LINK_RU,
  CHAT_RULES_PATH,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_UPDATED,
  privacyPolicyContact,
  privacyPolicySections,
} from '../../lib/legal/privacyPolicyCore.js'
import { PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'
import { formatDateRu } from '../../lib/dateRu.js'

/** Публичная страница A2 — без входа. */
export function PrivacyPolicyPage() {
  const contact = privacyPolicyContact()
  const updated = formatDateRu(PRIVACY_POLICY_UPDATED) || PRIVACY_POLICY_UPDATED

  return (
    <main className="privacy-policy">
      <header className="privacy-policy__head">
        <p className="privacy-policy__brand muted">{PRODUCT_BRAND_NAME}</p>
        <h1 className="privacy-policy__title">{PRIVACY_POLICY_TITLE}</h1>
        <p className="privacy-policy__meta muted">Обновлено {updated}</p>
      </header>

      <p className="privacy-policy__lead">
        Этот текст объясняет, как программа «{PRODUCT_BRAND_NAME}» обрабатывает персональные данные. Это не замена
        консультации юриста. Оператор ваших данных как клиента клуба — ваш клуб; мы — обработчик по его поручению.
        Правила общения в мессенджере клуба — отдельно:{' '}
        <Link to={CHAT_RULES_PATH}>{CHAT_RULES_LINK_RU}</Link>.
      </p>

      {privacyPolicySections().map((s) => (
        <section key={s.id} id={s.id} className="privacy-policy__section">
          <h2 className="privacy-policy__h2">{s.title}</h2>
          <p className="privacy-policy__body">{s.body}</p>
        </section>
      ))}

      <section id="contact" className="privacy-policy__section">
        <h2 className="privacy-policy__h2">Контакт</h2>
        <p className="privacy-policy__body">
          По вопросам обработки данных сначала обратитесь в свой клуб (администратор или управляющий).
          {contact ? (
            <>
              {' '}
              Вопросы к обработчику программы «{PRODUCT_BRAND_NAME}»:{' '}
              <a href={`mailto:${contact}`}>{contact}</a>.
            </>
          ) : (
            <> Реквизиты ИП и прямой контакт — в договоре клуба с «{PRODUCT_BRAND_NAME}».</>
          )}
        </p>
      </section>

      <p className="privacy-policy__back">
        <Link to={CHAT_RULES_PATH}>{CHAT_RULES_LINK_RU}</Link>
        {' · '}
        <Link to={OFFER_PATH}>{OFFER_LINK_RU}</Link>
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
