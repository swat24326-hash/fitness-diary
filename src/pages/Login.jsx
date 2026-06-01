import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Dumbbell, Lock, User } from 'lucide-react'
import { AppWelcomeSplash } from '../components/AppWelcomeSplash'
import { useAuth } from '../context/AuthContext'
import { getSupabaseSetupMessage } from '../lib/supabase'

export function Login() {
  const { user, role, signIn, loading, signingIn } = useAuth()
  const loc = useLocation()
  const from = loc.state?.from
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const setupMessage = getSupabaseSetupMessage()

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowInstallButton(false)
    }
    setDeferredPrompt(null)
  }

  if (!loading && user && role) {
    const dest = from && from !== '/login' ? from : role === 'admin' ? '/admin' : '/trainer'
    return <Navigate to={dest} replace />
  }

  if (signingIn) {
    const hint = login.trim()
    return <AppWelcomeSplash displayName={hint.includes('@') ? hint.split('@')[0] : hint} />
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const { error: err } = await signIn({ login: login.trim(), password })
    if (err) setError(err.message ?? 'Ошибка входа')
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <span className="login-brand__mark" aria-hidden>
            <Dumbbell size={40} strokeWidth={2} aria-hidden />
          </span>
        </div>
        <h1 className="login-title">Вход</h1>
        {setupMessage && (
          <p className="login-setup-warn" role="alert">
            {setupMessage}
          </p>
        )}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="login" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} aria-hidden />
              Логин
            </label>
            <input
              id="login"
              className="input"
              type="text"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              minLength={1}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={14} aria-hidden />
              Пароль
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 0 }} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-touch" style={{ width: '100%', marginTop: 8 }} disabled={loading || signingIn}>
            {signingIn ? '…' : loading ? '…' : 'Войти'}
          </button>
        </form>
        {showInstallButton && (
          <button type="button" onClick={handleInstall} className="install-btn">
            Установить приложение
          </button>
        )}
      </div>
    </div>
  )
}
