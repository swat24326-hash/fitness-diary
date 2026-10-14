import { NavLink } from 'react-router-dom'
import { MonitorSmartphone } from 'lucide-react'
import { useDeviceHealthCount } from '../hooks/useDeviceHealth.js'

/** Шапка админа: «Сбои устройств» — число планшетов, которым нужна помощь; красный значок — критичный сбой. */
export function HeaderDeviceHealthButton() {
  const { attention, critical } = useDeviceHealthCount(true)
  const label = attention ? `Сбои устройств: ${attention}` : 'Сбои устройств — всё в порядке'
  return (
    <NavLink
      to="/admin/health"
      className={({ isActive }) =>
        `btn btn-secondary btn-sm app-header__inbox-btn${isActive ? ' app-header__inbox-btn--active' : ''}`
      }
      title={label}
      aria-label={label}
      data-testid="header-device-health"
    >
      <MonitorSmartphone size={20} aria-hidden />
      {attention ? (
        <span className={`app-header__inbox-badge${critical ? ' device-health-badge--critical' : ''}`} aria-hidden>
          {attention > 99 ? '99+' : attention}
        </span>
      ) : null}
    </NavLink>
  )
}
