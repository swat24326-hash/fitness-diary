import { useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import { CoachShell } from './CoachShell.jsx'
import { CoachStatus } from './CoachStatus.jsx'

const PENDING_RETRY_MS = 15_000

/** Новый телефон ждёт «Разрешить» админа: тихо повторяем вход раз в 15 с, пока экран на виду. */
export function CoachPendingScreen({ busy, error, onRetry, children }) {
  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && onRetry(true), PENDING_RETRY_MS)
    return () => window.clearInterval(t)
  }, [onRetry])

  return (
    <CoachShell tabs={false}>
      <CoachStatus
        icon={ShieldCheck}
        title="Телефон ждёт разрешения"
        hint="Попросите администратора клуба нажать «Разрешить» в разделе «Устройства тренеров». Экран войдёт сам."
      >
        <button type="button" className="btn btn-secondary btn-touch" disabled={busy} onClick={() => onRetry(false)}>
          Проверить сейчас
        </button>
        {error ? <p className="coach-form__error" role="alert">{error}</p> : null}
        {children}
      </CoachStatus>
    </CoachShell>
  )
}
