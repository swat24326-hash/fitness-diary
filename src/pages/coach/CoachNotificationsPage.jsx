import { Bell } from 'lucide-react'
import { StaffNotificationsSettingsBlock } from '../../components/notifications/StaffNotificationsSettingsBlock.jsx'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachMenuPushSwitch } from './CoachMenuPushSwitch.jsx'
import { CoachShell } from './CoachShell.jsx'

/**
 * /coach/notifications — один блок: push, напоминания Ежедневника, звуки.
 * Лента заданий клиентам — на планшете (на телефоне нет client_plans).
 */
export function CoachNotificationsPage() {
  const { club } = useCoachApp()
  return (
    <CoachShell title="Уведомления">
      <StaffNotificationsSettingsBlock
        clubId={club?.id ?? ''}
        showPush
        showChatSound
        showScheduleReminders
        pushSlot={<CoachMenuPushSwitch />}
      />
      <p className="staff-notif-hint">
        <Bell size={14} aria-hidden /> Кто открыл задание или рацион — видно на планшете в «Уведомлениях». Сообщения клиентов — вкладка «Сообщения».
      </p>
    </CoachShell>
  )
}
