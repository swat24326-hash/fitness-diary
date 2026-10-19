import { useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Smartphone, X } from 'lucide-react'
import { AppWelcomeSplash } from '../components/AppWelcomeSplash'
import { OsMark } from '../components/brand/OsMark.jsx'
import { LegalEntryLinks } from '../components/legal/LegalEntryLinks.jsx'
import { useAuth } from '../context/AuthContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt.js'
import { useWelcomeSplashHold } from '../hooks/useWelcomeSplashHold.js'
import { isPwaUpdateInFlight } from '../lib/appUpdateInFlightSession.js'
import { normalizeLoginInput, normalizePasswordInput } from '../lib/authLoginResolveCore'
import { PRODUCT_BRAND_LOCKUP, PRODUCT_BRAND_NAME } from '../lib/productBrand.js'
import { getSupabaseSetupMessage } from '../lib/supabase'
import { roleHomePath } from '../lib/roleHomePathCore.js'

/**
 * Стартовый гейт `/`: сотрудник (логин на месте), тренер/клиент — на телефонные приложения.
 * `/login` остаётся запасным прямым входом.
 */
export function StartHubPage() {
  const { user, role, signIn, loading, signingIn } = useAuth()
  const loc = useLocation()
  const from = loc.state?.from
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const loginRef = useRef(null)
  const panelId = useId()
  const { hasPrompt, install } = useInstallPrompt()
  const setupMessage = getSupabaseSetupMessage()
  const updateInFlight = isPwaUpdateInFlight() && (loading || !user)
  const splashBusy = updateInFlight || loading || signingIn || Boolean(user && !role)
  const showWelcomeSplash = useWelcomeSplashHold(splashBusy)

  useEffect(() => {
    if (!panelOpen) return undefined
    const t = window.setTimeout(() => loginRef.current?.focus(), 40)
    const onKey = (e) => {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [panelOpen])

  if (showWelcomeSplash) {
    const hint = login.trim()
    const displayName = updateInFlight
      ? 'Обновляем приложение…'
      : signingIn
        ? hint.includes('@')
          ? hint.split('@')[0]
          : hint
        : undefined
    return <AppWelcomeSplash displayName={displayName} />
  }

  if (user && role) {
    const dest =
      from && from !== '/login' && from !== '/'
        ? from
        : roleHomePath(role)
    return <Navigate to={dest} replace />
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const { error: err } = await signIn({
      login: normalizeLoginInput(login),
      password: normalizePasswordInput(password),
    })
    if (err) setError(err.message ?? 'Ошибка входа')
  }

  return (
    <section className="start-hub" aria-label={`Стартовый вход ${PRODUCT_BRAND_NAME}`}>
      <div className="start-hub__photo" aria-hidden="true" />

      <header className="start-hub__top">
        <div className="start-hub__mark" aria-label={PRODUCT_BRAND_NAME}>
          <OsMark size={32} className="start-hub__mark-svg" />
          <span>{PRODUCT_BRAND_LOCKUP}</span>
        </div>

        <nav className="start-hub__roles" aria-label="Кто вы">
          <button
            type="button"
            className="start-hub__role"
            aria-expanded={panelOpen}
            aria-controls={panelId}
            title="Логин и пароль"
            onClick={() => setPanelOpen((v) => !v)}
          >
            Сотрудник
          </button>
          <span className="start-hub__sep" aria-hidden="true" />
          <Link
            to="/coach"
            className="start-hub__role"
            title="Тренер · вход с телефона"
            aria-label="Тренер · вход с телефона"
          >
            <Smartphone size={18} aria-hidden />
            Тренер
          </Link>
          <Link
            to="/me"
            className="start-hub__role"
            title="Клиент · вход с телефона"
            aria-label="Клиент · вход с телефона"
          >
            <Smartphone size={18} aria-hidden />
            Клиент
          </Link>

          <div
            className={`start-hub__panel${panelOpen ? ' is-open' : ''}`}
            id={panelId}
            role="dialog"
            aria-label="Вход сотрудника"
            aria-hidden={!panelOpen}
          >
            <h2 className="start-hub__panel-title">Вход сотрудника</h2>
            <p className="start-hub__panel-hint">Логин и пароль. Роль откроется сама.</p>
            {setupMessage ? (
              <p className="start-hub__warn" role="alert">
                {setupMessage}
              </p>
            ) : null}
            <form onSubmit={onSubmit}>
              <div className="start-hub__field">
                <label htmlFor="start-hub-login">Логин</label>
                <input
                  ref={loginRef}
                  id="start-hub-login"
                  name="login"
                  type="text"
                  autoComplete="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                  minLength={1}
                />
              </div>
              <div className="start-hub__field">
                <label htmlFor="start-hub-password">Пароль</label>
                <input
                  id="start-hub-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? (
                <p className="start-hub__error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="start-hub__panel-actions">
                <button type="submit" className="start-hub__btn-go btn-touch" disabled={loading || signingIn}>
                  {signingIn || loading ? '…' : 'Войти'}
                </button>
                <button
                  type="button"
                  className="start-hub__btn-close btn-touch"
                  aria-label="Закрыть"
                  onClick={() => setPanelOpen(false)}
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
            </form>
            {hasPrompt ? (
              <button type="button" className="start-hub__install" onClick={() => void install()}>
                Установить приложение
              </button>
            ) : null}
          </div>
        </nav>
        <div className="start-hub__spacer" aria-hidden="true" />
      </header>

      <div className="start-hub__hero">
        <h1 className="start-hub__title">
          Операционная система <em>фитнес-клуба</em>
        </h1>
        <p className="start-hub__lead">Зал. Продажи. Управление.</p>
      </div>

      <div className="start-hub__legal">
        <LegalEntryLinks />
      </div>
    </section>
  )
}
