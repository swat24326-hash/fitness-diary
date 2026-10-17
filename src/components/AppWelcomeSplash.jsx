import { useAuth } from '../context/AuthContext'
import { OsMark } from './brand/OsMark.jsx'
import { PRODUCT_BRAND_NAME } from '../lib/productBrand.js'
import {
  formatWelcomeGreeting,
  resolveWelcomeGreetingName,
} from '../lib/welcomeSplashGreeting.js'

/** Экран при старте сессии / во время входа вместо сухого «Загрузка…». */
export function AppWelcomeSplash({ displayName: displayNameProp } = {}) {
  const { user } = useAuth()
  const fromProp = String(displayNameProp ?? '').trim()
  const isStatus = /восстанавливаем|обновляем/i.test(fromProp)
  const rawName = isStatus ? '' : fromProp || String(user?.name ?? '').trim()
  const greetingName = resolveWelcomeGreetingName(rawName)
  const greetingLine = formatWelcomeGreeting(greetingName)
  const hint = isStatus ? fromProp : 'Открываем'
  const ariaLabel = `${PRODUCT_BRAND_NAME}. ${greetingLine}`

  return (
    <div className="app-loading-shell app-welcome-shell">
      <div className="app-welcome" role="status" aria-live="polite" aria-label={ariaLabel}>
        <div className="app-welcome__stage" aria-hidden>
          <div className="app-welcome__mark">
            <OsMark size={88} />
          </div>
        </div>
        <p className="app-welcome__greeting">
          <span className="app-welcome__greeting-lead">Приветствуем</span>
          {greetingName ? (
            <>
              , <span className="app-welcome__greeting-name">{greetingName}</span>
            </>
          ) : null}
        </p>
        <p className="app-welcome__hint">{hint}</p>
      </div>
    </div>
  )
}
