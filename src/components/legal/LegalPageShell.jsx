import { useLocation, useNavigate } from 'react-router-dom'
import { CloseButton } from '../CloseButton.jsx'
import { resolveLegalClose } from '../../lib/legal/legalPageCloseCore.js'

/**
 * Оболочка /privacy, /chat-rules, /offer: крестик возвращает на страницу из state (не слепой back).
 * reopenMyProfile уходит в state целевого маршрута — шапка/меню откроют окно после монтирования.
 */
export function LegalPageShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()

  function onClose() {
    const decided = resolveLegalClose({
      state: location.state,
      hasOpener: typeof window !== 'undefined' && Boolean(window.opener),
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
    navigate(decided.to || '/', { replace: true })
  }

  return (
    <main className="privacy-policy">
      <div className="privacy-policy__chrome">
        <CloseButton onClick={onClose} touch size={20} />
      </div>
      {children}
    </main>
  )
}
