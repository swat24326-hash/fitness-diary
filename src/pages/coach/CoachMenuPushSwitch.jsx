import { Bell, BellOff } from 'lucide-react'
import { ScheduleReminderSwitch } from '../../components/header/ScheduleReminderSwitch.jsx'
import { coachPushPrefs } from '../../lib/coach/coachApiClient.js'
import { useCoachPush } from './useCoachPush.js'

const PUSH_HINT = {
  on: 'Включены на этом телефоне',
  off: 'Выключены',
  install_first: 'На iPhone — только со значка: «Поделиться» → «На экран Домой», затем откройте значок',
  denied: 'Запрещены в настройках браузера — разрешите для этого сайта',
  none: 'На этом телефоне недоступны',
}

/** «Уведомления» в меню телефона тренера — тот же переключатель, что в «Настройках» планшета. */
export function CoachMenuPushSwitch() {
  const push = useCoachPush()
  const on = push.mode === 'on'
  const canToggle = on || push.mode === 'off'
  const hint = push.ready ? (PUSH_HINT[push.mode] ?? PUSH_HINT.none) : 'Проверяем…'

  return (
    <div className="header-push">
      <div className="app-header__menu-item header-push__row">
        {on ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
        <span className="header-push__label">
          Уведомления
          <small>{hint}</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Уведомления"
          className={`client-switch${on ? ' client-switch--on' : ''}`}
          disabled={!canToggle || push.busy || !push.ready}
          onClick={() => void (on ? push.disable() : push.enable())}
        >
          <span className="client-switch__knob" />
        </button>
      </div>
      {push.error ? (
        <p className="header-push__error" role="alert">
          {push.error}
        </p>
      ) : null}
      <ScheduleReminderSwitch pushOn={on} prefs={coachPushPrefs} />
    </div>
  )
}
