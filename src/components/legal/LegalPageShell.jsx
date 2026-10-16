import { useLocation, useNavigate } from 'react-router-dom'
import { CloseButton } from '../CloseButton.jsx'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { legalNeedsAppEntry, resolveLegalClose } from '../../lib/legal/legalPageCloseCore.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'
import { LegalAppEntryBar } from './LegalAppEntryBar.jsx'

/**
 * Оболочка /privacy, /chat-rules, /offer: крестик возвращает на страницу из state (не слепой back).
 * reopenMyProfile уходит в state целевого маршрута — шапка/меню откроют окно после монтирования.
 * Ярлык «Домой» с юр.страницы (без state) — кнопка в /me и fallback крестика на /me при сессии клиента.
 */
export function LegalPageShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const showAppEntry = legalNeedsAppEntry({ hasReturnTo: Boolean(location.state?.legalReturnTo) })
  const preferMe = showAppEntry || hasClientSession() || Boolean(readClientMeCache())

  function onClose() {
    const decided = resolveLegalClose({
      state: location.state,
      hasOpener: typeof window !== 'undefined' && Boolean(window.opener),
      fallbackHome: preferMe ? CLIENT_HOME : '/',
    })
    if (decided.action === 'close') {
      window.close()
      return
    }
    if (decided.action === 'return' && decided.to) {
      navigate(decided.to, {
        replace: true,
        state: decided.reopenMyProfile ? { reopenMyProfile: true } : undefined,
      })
      return
    }
    navigate(decided.to || CLIENT_HOME, { replace: true })
  }

  return (
    <main className="privacy-policy">
      <div className="privacy-policy__chrome">
        <CloseButton onClick={onClose} touch size={20} />
      </div>
      {showAppEntry ? <LegalAppEntryBar /> : null}
      {children}
    </main>
  )
}
