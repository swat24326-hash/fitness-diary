import { Download } from 'lucide-react'
import { useInstallPrompt } from '../../hooks/useInstallPrompt.js'

/** Планшет ещё не установлен, а браузер готов поставить значок — пункт в «Настройках» (после входа экрана входа нет). */
export function HeaderInstallItem() {
  const { hasPrompt, install } = useInstallPrompt()
  if (!hasPrompt) return null
  return (
    <button type="button" className="app-header__menu-item" onClick={() => void install()}>
      <Download size={18} aria-hidden />
      Установить приложение
    </button>
  )
}
