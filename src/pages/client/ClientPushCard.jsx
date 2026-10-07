import { Bell, BellOff } from 'lucide-react'

const TITLE = 'Напоминания о тренировках'

/**
 * Включить / выключить push накануне в 19:00. iPhone до установки — подсказка вместо кнопки.
 * @param {{ push: ReturnType<typeof import('./useClientPush.js').useClientPush> }} props
 */
export function ClientPushCard({ push }) {
  const { mode, busy, error, enable, disable } = push
  if (mode === 'none') return null
  return (
    <section className={`client-me-card client-me-push${mode === 'on' ? ' client-me-push--on' : ''}`}>
      <h2 className="client-me-card__title">
        <Bell size={18} aria-hidden />
        {TITLE}
      </h2>
      {mode === 'install_first' ? (
        <p className="client-me-muted">
          На iPhone напоминания приходят только в приложение со значком на экране «Домой». Установите его — и включите
          напоминания там.
        </p>
      ) : null}
      {mode === 'denied' ? (
        <p className="client-me-muted">
          Уведомления запрещены в настройках телефона. Разрешите их для этого приложения и откройте его снова.
        </p>
      ) : null}
      {mode === 'off' ? (
        <>
          <p className="client-me-muted">Накануне в 19:00 напомним время тренировки и тренера.</p>
          <button type="button" className="btn btn-primary btn-touch" onClick={() => void enable()} disabled={busy}>
            <Bell size={18} aria-hidden />
            Включить напоминания
          </button>
        </>
      ) : null}
      {mode === 'on' ? (
        <div className="client-me-push__row">
          <p className="client-me-muted">Включены — накануне в 19:00</p>
          <button
            type="button"
            className="btn btn-ghost btn-icon-square btn-touch"
            onClick={() => void disable()}
            disabled={busy}
            title="Выключить напоминания"
            aria-label="Выключить напоминания"
          >
            <BellOff size={18} aria-hidden />
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="client-me-push__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
