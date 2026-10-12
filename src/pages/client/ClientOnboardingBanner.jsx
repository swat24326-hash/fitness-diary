import { Bell } from 'lucide-react'
import { useClientApp } from './ClientAppContext.jsx'
import { ClientInstallHint } from './ClientInstallHint.jsx'

function Frame({ icon: Icon, title, index, total, children, onLater }) {
  return (
    <section className="client-onb" aria-label={title}>
      {total > 1 ? (
        <span className="client-onb__step">
          Шаг {index} из {total}
        </span>
      ) : null}
      <span className="client-onb__icon" aria-hidden>
        <Icon size={26} />
      </span>
      <h2 className="client-onb__title">{title}</h2>
      {children}
      <button type="button" className="btn btn-ghost btn-touch client-onb__later" onClick={onLater}>
        Позже
      </button>
    </section>
  )
}

/** Баннеры первого входа: один шаг за раз, одна большая кнопка. */
export function ClientOnboardingBanner({ clubName }) {
  const { installer, push, onboarding } = useClientApp()
  const { step, index, total } = onboarding
  if (!step) return null
  const name = clubName || 'клуба'
  const later = () => onboarding.later(step)

  if (step === 'install') {
    return <ClientInstallHint name={name} installer={installer} onDone={() => onboarding.done('install')} />
  }

  return (
    <Frame icon={Bell} title="Включите напоминания о тренировках" index={index} total={total} onLater={later}>
      <p className="client-onb__text">Накануне в 19:00 напомним время тренировки и тренера. Выключить можно в настройках.</p>
      <button
        type="button"
        className="btn btn-primary btn-touch client-onb__cta"
        disabled={push.busy}
        onClick={async () => {
          if (await push.enable()) onboarding.done('push')
        }}
      >
        <Bell size={20} aria-hidden />
        Включить напоминания
      </button>
      {push.error ? (
        <p className="client-onb__error" role="alert">
          {push.error}
        </p>
      ) : null}
    </Frame>
  )
}
