import { Link } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'

/** В «Мой профиль» — одна строка «Уведомления» на общий экран (не второй набор переключателей). */
export function NotificationsProfileLink({ to, hint = 'Push, напоминания, звуки' }) {
  return (
    <Link to={to} className="app-header__menu-item" data-testid="notifications-fold">
      <Bell size={18} aria-hidden />
      <span className="header-push__label">
        Уведомления
        <small>{hint}</small>
      </span>
      <ChevronRight size={18} aria-hidden />
    </Link>
  )
}
