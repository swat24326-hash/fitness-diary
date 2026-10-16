import { Link } from 'react-router-dom'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

/**
 * Прямой заход на /privacy|/chat-rules|/offer (ярлык «Домой» с правил, без return state):
 * кнопка в приложение клиента — иначе крестик вёл на вход сотрудников.
 */
export function LegalAppEntryBar() {
  return (
    <p className="legal-app-entry" role="navigation">
      <Link to={CLIENT_HOME} className="btn btn-primary btn-touch legal-app-entry__btn" replace>
        Открыть приложение клуба
      </Link>
      <span className="legal-app-entry__hint muted">Значок ставьте с главной после входа по QR — не с этой страницы.</span>
    </p>
  )
}
