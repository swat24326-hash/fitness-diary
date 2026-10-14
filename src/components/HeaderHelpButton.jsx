import { CircleHelp } from 'lucide-react'
import { useDeviceProblems } from '../hooks/useDeviceProblems.js'
import { DEVICE_HEALTH_CODES } from '../lib/deviceHealth/deviceHealthCatalog.js'

/** Шапка тренера: «Помощь» появляется, только когда с планшетом что-то не так (в обычный день её нет). */
export function HeaderHelpButton({ onOpen }) {
  const problems = useDeviceProblems()
  if (!problems.length) return null
  const label = `Помощь: ${DEVICE_HEALTH_CODES[problems[0]]?.title ?? 'сбой планшета'}`
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm app-header__inbox-btn app-header__help-btn"
      title={label}
      aria-label={label}
      onClick={onOpen}
      data-testid="header-help"
    >
      <CircleHelp size={20} aria-hidden />
      <span className="app-header__inbox-badge device-health-badge--critical" aria-hidden>
        !
      </span>
    </button>
  )
}
