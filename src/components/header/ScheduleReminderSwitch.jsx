import { CalendarClock, CalendarOff } from 'lucide-react'
import { useScheduleReminderSetting } from '../../hooks/useScheduleReminderSetting.js'

function hintFor(pushOn, setting) {
  if (!pushOn) return 'Сначала включите уведомления'
  if (setting.status === 'loading' || setting.status === 'idle') return 'Проверяем…'
  if (setting.status === 'unavailable') return 'Пока недоступны'
  return setting.on ? 'За 15 минут до записи' : 'Выключены'
}

/** «Напоминания из Ежедневника» под «Уведомлениями» — планшет и телефон тренера, своё на каждом устройстве. */
export function ScheduleReminderSwitch({ pushOn, prefs }) {
  const setting = useScheduleReminderSetting({ pushOn, prefs })
  const on = pushOn && setting.status === 'ready' && setting.on
  return (
    <div className="header-push">
      <div className="app-header__menu-item header-push__row">
        {on ? <CalendarClock size={18} aria-hidden /> : <CalendarOff size={18} aria-hidden />}
        <span className="header-push__label">
          Напоминания из Ежедневника
          <small>{hintFor(pushOn, setting)}</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Напоминания из Ежедневника"
          className={`client-switch${on ? ' client-switch--on' : ''}`}
          disabled={!pushOn || setting.status !== 'ready' || setting.busy}
          onClick={() => void setting.toggle()}
        >
          <span className="client-switch__knob" />
        </button>
      </div>
      {setting.error ? (
        <p className="header-push__error" role="alert">
          {setting.error}
        </p>
      ) : null}
    </div>
  )
}
