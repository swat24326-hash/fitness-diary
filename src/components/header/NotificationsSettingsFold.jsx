import { useState } from 'react'
import { Bell, ChevronDown } from 'lucide-react'

/**
 * Одна строка «Уведомления» в «Мой профиль» тренера: нажал — раскрываются переключатели
 * (push, напоминания Ежедневника, звуки), как «QR для телефона».
 */
export function NotificationsSettingsFold({ children, hint = 'Push, напоминания, звуки' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="header-notifications-fold">
      <button
        type="button"
        className="app-header__menu-item"
        aria-expanded={open}
        aria-controls="header-notifications-fold-panel"
        onClick={() => setOpen((o) => !o)}
        data-testid="notifications-fold"
      >
        <Bell size={18} aria-hidden />
        <span className="header-push__label">
          Уведомления
          <small>{hint}</small>
        </span>
        <ChevronDown size={18} aria-hidden className={`coach-qr-panel__chevron${open ? ' coach-qr-panel__chevron--open' : ''}`} />
      </button>
      {open ? (
        <div id="header-notifications-fold-panel" className="header-notifications-fold__panel" role="group" aria-label="Настройки уведомлений">
          {children}
        </div>
      ) : null}
    </div>
  )
}
