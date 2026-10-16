import { useNavigate } from 'react-router-dom'
import { CloseButton } from '../CloseButton.jsx'
import { legalPageCloseAction } from '../../lib/legal/legalPageCloseCore.js'

/**
 * Оболочка /privacy, /chat-rules, /offer: крестик вместо «аэропорта» ссылок на все входы.
 */
export function LegalPageShell({ children }) {
  const navigate = useNavigate()

  function onClose() {
    const action = legalPageCloseAction({
      historyLength: typeof window !== 'undefined' ? window.history.length : 0,
      hasOpener: typeof window !== 'undefined' && Boolean(window.opener),
    })
    if (action === 'back') {
      navigate(-1)
      return
    }
    if (action === 'close') {
      window.close()
      return
    }
    navigate('/login')
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
