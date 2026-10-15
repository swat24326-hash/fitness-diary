import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Menu, RefreshCw, Settings, Smartphone } from 'lucide-react'
import { ProfileMenuUser } from '../../components/profile/ProfileMenuUser.jsx'
import { postClientMe } from '../../lib/client/clientSession.js'
import { avatarApiOver } from '../../lib/profile/avatarApi.js'
import { useClientApp } from './ClientAppContext.jsx'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

const clientAvatarApi = avatarApiOver(postClientMe)

function navClass({ isActive }) {
  return `app-header__menu-item${isActive ? ' client-menu__item--active' : ''}`
}

/**
 * Бургер /me — выпадающее меню как у тренера (app-header__dropdown / __menu-item из index.css),
 * все строки одного вида: кто вошёл → разделы → действия → «Выйти». Новый раздел — ещё один NavLink в ClientMenuItems.
 * onRefresh — «Обновить» данные открытого экрана (как у тренера — в меню, не в шапке).
 * @param {{ clientName?: string, onLogout: () => void, onRefresh?: (() => void) | null, refreshing?: boolean }} props
 */
export function ClientMenu({ clientName = '', onLogout, onRefresh = null, refreshing = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="client-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="client-menu-dropdown"
        title="Меню"
        aria-label="Меню"
      >
        <Menu size={22} aria-hidden />
      </button>
      {open ? (
        <div id="client-menu-dropdown" className="app-header__dropdown" role="region" aria-label="Меню">
          <ClientMenuItems clientName={clientName} onLogout={onLogout} onRefresh={onRefresh} refreshing={refreshing} close={() => setOpen(false)} />
        </div>
      ) : null}
    </span>
  )
}

/** Строки меню клиента — в ☰ экранов и в «⋮» шапки диалога. close — закрыть то меню, где они стоят. */
export function ClientMenuItems({ clientName = '', onLogout, onRefresh = null, refreshing = false, close = () => {} }) {
  const navigate = useNavigate()
  const { installer, onboarding } = useClientApp()
  return (
    <>
      {clientName ? <ProfileMenuUser name={clientName} api={clientAvatarApi} cacheKey="client" /> : null}
      <NavLink to="/me/settings" className={navClass} onClick={close}>
        <Settings size={18} aria-hidden />
        Настройки
      </NavLink>
      {installer.mode !== 'none' ? (
        <button
          type="button"
          className="app-header__menu-item"
          onClick={() => {
            close()
            navigate(CLIENT_HOME)
            onboarding.show('install')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <Smartphone size={18} aria-hidden />
          Установить на телефон
        </button>
      ) : null}
      {onRefresh ? (
        <button
          type="button"
          className="app-header__menu-item"
          disabled={refreshing}
          onClick={() => {
            close()
            onRefresh()
          }}
        >
          <RefreshCw size={18} aria-hidden className={refreshing ? 'client-me-spin' : undefined} />
          Обновить
        </button>
      ) : null}
      <button
        type="button"
        className="app-header__menu-item app-header__menu-item--danger"
        onClick={() => {
          close()
          if (window.confirm('Выйти? Войти снова можно будет только по новой ссылке из клуба.')) onLogout()
        }}
      >
        <LogOut size={18} aria-hidden />
        Выйти
      </button>
    </>
  )
}
