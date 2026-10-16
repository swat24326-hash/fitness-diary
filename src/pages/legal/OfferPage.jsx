import { LegalCrossLink } from '../../components/legal/LegalCrossLink.jsx'
import { LegalPageShell } from '../../components/legal/LegalPageShell.jsx'
import {
  OFFER_PARTY,
  OFFER_TITLE,
  OFFER_UPDATED,
  OFFER_VERSION,
  offerSections,
} from '../../lib/legal/offerCore.js'
import { PRIVACY_POLICY_LINK_RU, PRIVACY_POLICY_PATH } from '../../lib/legal/privacyPolicyCore.js'
import { PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'
import { formatDateRu } from '../../lib/dateRu.js'

/** Публичная оферта — без входа. */
export function OfferPage() {
  const updated = formatDateRu(OFFER_UPDATED) || OFFER_UPDATED

  return (
    <LegalPageShell>
      <header className="privacy-policy__head">
        <p className="privacy-policy__brand muted">{PRODUCT_BRAND_NAME}</p>
        <h1 className="privacy-policy__title">{OFFER_TITLE}</h1>
        <p className="privacy-policy__meta muted">
          Версия {OFFER_VERSION} · обновлено {updated}
        </p>
      </header>

      <p className="privacy-policy__lead">
        Договор‑оферта на доступ клуба к программе «{PRODUCT_BRAND_NAME}». Это не замена консультации юриста.
        Принимает управляющий клуба при первом входе. Политика персональных данных —{' '}
        <LegalCrossLink to={PRIVACY_POLICY_PATH}>{PRIVACY_POLICY_LINK_RU}</LegalCrossLink>.
      </p>

      <p className="privacy-policy__body">
        <strong>Исполнитель:</strong> ИП {OFFER_PARTY.name}, ИНН {OFFER_PARTY.inn}, ОГРНИП {OFFER_PARTY.ogrnip},{' '}
        {OFFER_PARTY.address}. Email: <a href={`mailto:${OFFER_PARTY.email}`}>{OFFER_PARTY.email}</a>.
      </p>

      {offerSections().map((s) => (
        <section key={s.id} id={s.id} className="privacy-policy__section">
          <h2 className="privacy-policy__h2">{s.title}</h2>
          <p className="privacy-policy__body">{s.body}</p>
        </section>
      ))}
    </LegalPageShell>
  )
}
