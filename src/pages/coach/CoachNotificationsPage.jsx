import { Bell } from 'lucide-react'
import { CoachShell } from './CoachShell.jsx'

/**
 * /coach/notifications — лента «кто открыл задание» на телефоне пока пустая (данные на планшете).
 * Настройки push — в «Мой профиль» → «Уведомления».
 */
export function CoachNotificationsPage() {
  return (
    <CoachShell title="Уведомления">
      <p className="os-empty-card__hint">
        Пока тихо. Кто открыл задание или рацион — видно на планшете в «Уведомлениях».
      </p>
      <p className="staff-notif-hint">
        <Bell size={14} aria-hidden /> Push и звуки — в «Мой профиль» → «Уведомления». Сообщения клиентов — вкладка «Сообщения».
      </p>
    </CoachShell>
  )
}
