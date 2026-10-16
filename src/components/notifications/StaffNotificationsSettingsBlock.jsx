import { HeaderPushSwitch } from '../header/HeaderPushSwitch.jsx'
import { HeaderChatSoundSwitch } from '../header/HeaderChatSoundSwitch.jsx'

/**
 * Один блок настроек уведомлений (push / напоминания / звуки) — на экране «Уведомления»,
 * не размазан по меню.
 */
export function StaffNotificationsSettingsBlock({
  clubId = '',
  showPush = true,
  showChatSound = true,
  showScheduleReminders = false,
  pushSlot = null,
}) {
  return (
    <section className="staff-notif-settings" aria-label="Настройки уведомлений">
      <h2 className="staff-notif-settings__title">Настройки</h2>
      <div className="staff-notif-settings__list" role="group">
        {pushSlot ?? (showPush ? <HeaderPushSwitch clubId={clubId} scheduleReminders={showScheduleReminders} /> : null)}
        {showChatSound ? <HeaderChatSoundSwitch /> : null}
      </div>
    </section>
  )
}
