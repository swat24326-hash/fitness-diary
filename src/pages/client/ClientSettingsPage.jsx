import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell } from 'lucide-react'
import { hasClientSession, logoutClient, readClientMeCache } from '../../lib/client/clientSession.js'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientMenu } from './ClientMenu.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'

const REMINDER_HINT = {
  install_first: 'На iPhone напоминания работают только в приложении со значка на экране «Домой». Установите его через меню.',
  denied: 'Уведомления запрещены в настройках телефона. Разрешите их для этого приложения и откройте его снова.',
  none: 'Напоминания пока недоступны на этом телефоне.',
}

/** /me/settings — настройки клиента. Сейчас: напоминания о тренировках. */
export function ClientSettingsPage() {
  const navigate = useNavigate()
  const { push } = useClientApp()
  if (!hasClientSession()) return <Navigate to="/me" replace />
  const cached = readClientMeCache()
  const club = cached?.data?.club ?? null
  const on = push.mode === 'on'
  const canToggle = on || push.mode === 'off'

  const actions = (
    <span className="client-me__actions">
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        onClick={() => navigate('/me')}
        title="Назад"
        aria-label="Назад"
      >
        <ArrowLeft size={20} aria-hidden />
      </button>
      <ClientMenu
        clientName={cached?.data?.client?.name || ''}
        onLogout={() => void logoutClient().then(() => navigate('/me', { replace: true }))}
      />
    </span>
  )

  return (
    <ClientMeShell actions={actions} club={club}>
      <h1 className="client-me__hello">Настройки</h1>
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
