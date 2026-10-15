import { RefreshCw, WifiOff } from 'lucide-react'
import { useNetStatusBar } from '../../hooks/useNetStatusBar.js'
import { NET_BAR_TEXT_RU } from '../../lib/net/netStatusBarCore.js'
import '../../styles/net-status.css'

/** Плашка «Нет сети» / «Соединение…» поверх экрана (приложение клиента и телефон тренера), вёрстку не сдвигает. */
export function NetStatusBar() {
  const state = useNetStatusBar()
  if (!state) return null
  const Icon = state === 'offline' ? WifiOff : RefreshCw
  return (
    <div className={`net-bar net-bar--${state}`} role="status" aria-live="polite">
      <Icon size={14} aria-hidden className={state === 'connecting' ? 'net-bar__spin' : undefined} />
      <span>{NET_BAR_TEXT_RU[state]}</span>
    </div>
  )
}
