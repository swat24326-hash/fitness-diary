import { useCallback, useEffect, useRef, useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { CoachPendingError, signInCoach } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachStatus } from './CoachStatus.jsx'

const PENDING_RETRY_MS = 15_000

/**
 * Вход логином и паролем планшета. Новый телефон ждёт «Разрешить» админа: повторяем вход раз в 15 с,
 * пароль живёт только в памяти этой страницы (закрыли — вводить заново).
 */
export function CoachSignInPage() {
  const { notice, onSignedIn } = useCoachApp()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const creds = useRef({ login: '', password: '' })

  const attempt = useCallback(
    async (quiet) => {
      if (!quiet) {
        setBusy(true)
        setError('')
      }
      try {
        await signInCoach(creds.current.login, creds.current.password)
        creds.current = { login: '', password: '' }
        onSignedIn()
      } catch (e) {
        if (e instanceof CoachPendingError) setPending(true)
        else {
          setPending(false)
          setError(e?.message || 'Не удалось войти')
        }
      } finally {
        if (!quiet) setBusy(false)
      }
    },
    [onSignedIn],
  )

  useEffect(() => {
    if (!pending) return undefined
    const t = window.setInterval(() => document.visibilityState === 'visible' && void attempt(true), PENDING_RETRY_MS)
    return () => window.clearInterval(t)
  }, [pending, attempt])

  const submit = (e) => {
    e.preventDefault()
    creds.current = { login: login.trim(), password }
    void attempt(false)
  }

  if (pending) {
    return (
      <CoachShell tabs={false}>
        <CoachStatus
          icon={ShieldCheck}
          title="Телефон ждёт разрешения"
          hint="Попросите администратора клуба нажать «Разрешить» в разделе «Устройства тренеров». Экран войдёт сам."
        >
          <button type="button" className="btn btn-secondary btn-touch" disabled={busy} onClick={() => void attempt(false)}>
            Проверить сейчас
          </button>
          {error ? <p className="coach-form__error" role="alert">{error}</p> : null}
        </CoachStatus>
      </CoachShell>
    )
  }

  return (
    <CoachShell tabs={false}>
      <form className="coach-card coach-form" onSubmit={submit}>
        <h1 className="coach-form__title">Вход тренера</h1>
        <p className="muted">Логин и пароль — те же, что на планшете. Первый вход с телефона разрешает администратор.</p>
        {notice && !error ? <p className="coach-form__notice" role="status">{notice}</p> : null}
        <label className="coach-form__field">
          <span>Логин</span>
          <input
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </label>
        <label className="coach-form__field">
          <span>Пароль</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p className="coach-form__error" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-primary btn-touch" disabled={busy || !login.trim() || !password}>
          <LogIn size={18} aria-hidden /> {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </CoachShell>
  )
}
