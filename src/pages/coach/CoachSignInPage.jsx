import { useCallback, useRef, useState } from 'react'
import { LogIn } from 'lucide-react'
import { LegalEntryLinks } from '../../components/legal/LegalEntryLinks.jsx'
import { CoachPendingError, signInCoach } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachPendingScreen } from './CoachPendingScreen.jsx'
import { CoachShell } from './CoachShell.jsx'

/**
 * Вход логином и паролем планшета. Пока телефон ждёт «Разрешить», пароль живёт только в памяти
 * этой страницы (закрыли — вводить заново; вход по QR с планшета этого не требует).
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

  const submit = (e) => {
    e.preventDefault()
    creds.current = { login: login.trim(), password }
    void attempt(false)
  }

  if (pending) return <CoachPendingScreen busy={busy} error={error} onRetry={attempt} />

  return (
    <CoachShell tabs={false}>
      <form className="coach-card coach-form" onSubmit={submit}>
        <h1 className="coach-form__title">Вход тренера</h1>
        <p className="muted">
          Проще всего — QR: на планшете меню → своё имя сверху → «QR для телефона». Или логин и пароль, как на планшете. Новый телефон
          вместо прежнего разрешает администратор.
        </p>
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
        <LegalEntryLinks />
      </form>
    </CoachShell>
  )
}
