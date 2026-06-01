import { Dumbbell } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/** Экран при старте сессии / во время входа вместо сухого «Загрузка…». */
export function AppWelcomeSplash({ displayName: displayNameProp } = {}) {
  const { user } = useAuth()
  const fromProp = String(displayNameProp ?? '').trim()
  const rawName = fromProp || String(user?.name ?? '').trim()
  const name = rawName || (user?.email ? String(user.email).split('@')[0] : '')

  return (
    <div className="app-loading-shell app-welcome-shell">
      <div className="app-welcome" role="status" aria-live="polite" aria-label="Добро пожаловать">
        <div className="app-welcome__stage" aria-hidden>
          <span className="app-welcome__glow" />
          <div className="app-welcome__dumbbell">
            <Dumbbell size={52} strokeWidth={2.25} />
          </div>
          <span className="app-welcome__spark app-welcome__spark--a">💪</span>
          <span className="app-welcome__spark app-welcome__spark--b">✨</span>
          <span className="app-welcome__spark app-welcome__spark--c">🔥</span>
        </div>
        <p className="app-welcome__brand">FIT-CITY</p>
        <h1 className="app-welcome__title">Добро пожаловать</h1>
        {name ? <p className="app-welcome__name">{name}</p> : null}
        <p className="app-welcome__hint">
          <span className="app-welcome__dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          Разминаем интерфейс
        </p>
      </div>
    </div>
  )
}
