import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Settings, Smartphone, User } from 'lucide-react'
import { useClientApp } from './ClientAppContext.jsx'

function navClass({ isActive }) {
  return `app-header__menu-item${isActive ? ' client-menu__item--active' : ''}`
}

/**
 * Бургер /me — выпадающее меню как у тренера (app-header__dropdown / __menu-item из index.css),
 * все строки одного вида: кто вошёл → разделы → действия → «Выйти». Новый раздел — ещё один NavLink.
 * @param {{ clientName?: string, onLogout: () => void }} props
 */
export function ClientMenu({ clientName = '', onLogout }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const navigate = useNavigate()
  const { installer, onboarding } = useClientApp()

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

  const close = () => setOpen(false)

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
          {clientName ? (
            <div className="app-header__menu-item client-menu__who">
              <User size={18} aria-hidden />
              {clientName}
            </div>
          ) : null}
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
                navigate('/me')
                onboarding.show('install')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <Smartphone size={18} aria-hidden />
              Установить на телефон
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
        </div>
      ) : null}
    </span>
  )
}
