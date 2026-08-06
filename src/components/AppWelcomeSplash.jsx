import { useAuth } from '../context/AuthContext'
import { OsWordmark } from './brand/OsMark.jsx'
import { PRODUCT_BRAND_TAGLINE } from '../lib/productBrand.js'

/** Экран при старте сессии / во время входа вместо сухого «Загрузка…». */
export function AppWelcomeSplash({ displayName: displayNameProp } = {}) {
  const { user } = useAuth()
  const fromProp = String(displayNameProp ?? '').trim()
  const isRecovering = /восстанавливаем/i.test(fromProp)
  const rawName = isRecovering ? '' : fromProp || String(user?.name ?? '').trim()
  const name = rawName || (user?.email ? String(user.email).split('@')[0] : '')
  const hint = isRecovering ? fromProp : 'Разминаем интерфейс'

  return (
    <div className="app-loading-shell app-welcome-shell">
      <div className="app-welcome" role="status" aria-live="polite" aria-label="Добро пожаловать">
        <div className="app-welcome__stage" aria-hidden>
          <span className="app-welcome__glow" />
          <div className="app-welcome__dumbbell app-welcome__mark app-welcome__lockup">
            <OsWordmark markSize={56} className="app-welcome__wordmark" textClassName="app-welcome__wordmark-text" />
          </div>
          <span className="app-welcome__spark app-welcome__spark--a">💪</span>
          <span className="app-welcome__spark app-welcome__spark--b">✨</span>
          <span className="app-welcome__spark app-welcome__spark--c">🔥</span>
        </div>
        <p className="app-welcome__tagline">{PRODUCT_BRAND_TAGLINE}</p>
        <h1 className="app-welcome__title">Добро пожаловать</h1>
        {name ? <p className="app-welcome__name">{name}</p> : null}
        <p className="app-welcome__hint">
          <span className="app-welcome__dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          {hint}
        </p>
      </div>
    </div>
  )
}
