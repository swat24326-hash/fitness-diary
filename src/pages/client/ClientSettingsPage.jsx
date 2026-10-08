import { Navigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'

const REMINDER_HINT = {
  install_first: 'На iPhone напоминания работают только в приложении со значка на экране «Домой». Установите его через меню.',
  denied: 'Уведомления запрещены в настройках телефона. Разрешите их для этого приложения и откройте его снова.',
  none: 'Напоминания пока недоступны на этом телефоне.',
}

/** /me/settings — настройки клиента. Сейчас: напоминания о тренировках. */
export function ClientSettingsPage() {
  const { push } = useClientApp()
  if (!hasClientSession()) return <Navigate to="/me" replace />
  const cached = readClientMeCache()
  const club = cached?.data?.club ?? null
  const on = push.mode === 'on'
  const canToggle = on || push.mode === 'off'

  return (
    <ClientMeShell actions={<ClientPageActions />} club={club}>
      <ClientPageTitle title="Настройки" />
      <section className="client-me-card">
        <div className="client-settings__row">
          <span className="client-settings__label">
            <Bell size={18} aria-hidden />
            <span>
              Напоминания о тренировках
              <small className="client-me-muted">Накануне в 19:00</small>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Напоминания о тренировках"
            className={`client-switch${on ? ' client-switch--on' : ''}`}
            disabled={!canToggle || push.busy}
            onClick={() => void (on ? push.disable() : push.enable())}
          >
            <span className="client-switch__knob" />
          </button>
        </div>
        {canToggle || !push.ready ? null : <p className="client-me-muted">{REMINDER_HINT[push.mode] ?? REMINDER_HINT.none}</p>}
        {push.error ? (
          <p className="client-onb__error" role="alert">
            {push.error}
          </p>
        ) : null}
      </section>
    </ClientMeShell>
  )
}
