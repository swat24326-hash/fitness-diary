import { Bell, BellOff } from 'lucide-react'
import { useTrainerPush } from '../../hooks/useTrainerPush.js'

/** «Уведомления» в «Настройках» бургера — переключатель, как у клиента. «Проверить» / «Переподключить» — в «Помощи». */
export function HeaderPushSwitch({ clubId }) {
  const push = useTrainerPush({ clubId })
  const on = push.subscribed
  const denied = push.permission === 'denied' && !on
  const canToggle = push.supported && !denied
  const hint = !push.supported ? 'Браузер не поддерживает' : denied ? 'Запрещены в браузере' : on ? 'Включены на этом устройстве' : 'Выключены'

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
          disabled={!canToggle || push.busy}
          onClick={() => void (on ? push.unsubscribe() : push.subscribe())}
        >
          <span className="client-switch__knob" />
        </button>
      </div>
      {push.error ? (
        <p className="header-push__error" role="alert">
          {push.error}
        </p>
      ) : null}
    </div>
  )
}
