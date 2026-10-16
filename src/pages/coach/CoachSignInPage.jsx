import { useCallback, useRef, useState } from 'react'
import { Camera, ChevronDown, LogIn } from 'lucide-react'
import { LegalEntryLinks } from '../../components/legal/LegalEntryLinks.jsx'
import { useInstallPrompt } from '../../hooks/useInstallPrompt.js'
import { clientInstallMode } from '../../lib/client/clientInstallCore.js'
import { isCoachStandalone } from '../../lib/coach/coachInstall.js'
import { CoachPendingError, signInCoach } from '../../lib/coach/coachSession.js'
import { ClientInstallHint } from '../client/ClientInstallHint.jsx'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachPendingScreen } from './CoachPendingScreen.jsx'
import { CoachQrScanSheet } from './CoachQrScanSheet.jsx'
import { COACH_APP_TITLE, CoachShell } from './CoachShell.jsx'

/**
 * Вход на телефон: (1) значок «Домой», (2) «Войти по QR» с планшета — сессия сразу в приложении.
 * Логин и пароль — запасной путь (как на планшете).
 */
export function CoachSignInPage() {
  const { notice, onSignedIn } = useCoachApp()
  const { hasPrompt, installedNow, install } = useInstallPrompt()
  const installed = installedNow || isCoachStandalone()
  const mode = clientInstallMode({
    standalone: installed,
    hasPrompt,
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  })
  const installer = { mode, install, installed }

  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const creds = useRef({ login: '', password: '' })

  const needInstall = mode !== 'none' && !installed && !installDismissed

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
      <div className="coach-card coach-form">
        <h1 className="coach-form__title">Вход тренера</h1>
        <p className="muted">
          {installed
            ? 'Нажмите «Войти по QR» и наведите камеру на код с планшета (меню → своё имя → «QR для телефона»).'
            : 'На iPhone лучше сначала поставить значок, потом войти по QR — тогда вход останется в приложении.'}
        </p>
        {notice && !error ? <p className="coach-form__notice" role="status">{notice}</p> : null}

        {needInstall ? (
          <div className="client-signin__step">
            <span className="client-signin__step-n">1</span>
            <ClientInstallHint
              name={COACH_APP_TITLE}
              installer={installer}
              onDone={() => setInstallDismissed(true)}
              lastStep={`Откройте значок «${COACH_APP_TITLE}» и нажмите «Войти по QR»`}
            />
          </div>
        ) : null}

        <div className={`client-signin__step${needInstall ? '' : ' client-signin__step--solo'}`}>
          {needInstall ? <span className="client-signin__step-n">2</span> : null}
          <button type="button" className="btn btn-primary btn-touch client-signin__qr" onClick={() => setScanOpen(true)}>
            <Camera size={22} aria-hidden />
            Войти по QR
          </button>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-touch coach-signin__password-toggle"
          aria-expanded={passwordOpen}
          onClick={() => setPasswordOpen((o) => !o)}
        >
          <ChevronDown size={18} aria-hidden className={passwordOpen ? 'coach-signin__chevron--open' : ''} />
          Войти логином и паролем
        </button>

        {passwordOpen ? (
          <form className="coach-signin__password" onSubmit={submit}>
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
            <button type="submit" className="btn btn-secondary btn-touch" disabled={busy || !login.trim() || !password}>
              <LogIn size={18} aria-hidden /> {busy ? 'Входим…' : 'Войти'}
            </button>
          </form>
        ) : error ? (
          <p className="coach-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <LegalEntryLinks />
      </div>

      {scanOpen ? (
        <CoachQrScanSheet
          onClose={() => setScanOpen(false)}
          onOk={() => {
            setScanOpen(false)
            onSignedIn()
          }}
          onPending={() => {
            setScanOpen(false)
            setPending(true)
          }}
        />
      ) : null}
    </CoachShell>
  )
}
