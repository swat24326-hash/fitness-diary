import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { flushSyncQueue } from '../lib/syncService'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, LogOut, Menu, RefreshCw, Trophy, User, UserCircle, BookOpen, Building2 } from 'lucide-react'
import { listClubsLocal, LOCAL_DATA_CHANGED } from '../lib/dataAccess'

function headerNavClass({ isActive }) {
  return `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
}

function menuNavClass({ isActive }) {
  return `app-header__menu-link${isActive ? ' app-header__menu-link--active' : ''}`
}

export function AppHeader() {
  const { user, signOut, isAdmin, supabaseReady } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [online, setOnline] = useState(navigator.onLine)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRootRef = useRef(null)
  const [adminClubs, setAdminClubs] = useState([])

  const showAdminClubSelect = isAdmin && location.pathname.startsWith('/admin')
  const adminClubValue = searchParams.get('club') ?? ''
  const adminQs = useMemo(() => (adminClubValue ? `?club=${encodeURIComponent(adminClubValue)}` : ''), [adminClubValue])

  useEffect(() => {
    if (!showAdminClubSelect) return
    let alive = true
    const load = async () => {
      try {
        const rows = await listClubsLocal()
        if (alive) setAdminClubs(Array.isArray(rows) ? rows : [])
      } catch {
        if (alive) setAdminClubs([])
      }
    }
    void load()
    const onData = () => {
      void load()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => {
      alive = false
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
    }
  }, [showAdminClubSelect])

  useEffect(() => {
    const fn = () => setOnline(navigator.onLine)
    window.addEventListener('online', fn)
    window.addEventListener('offline', fn)
    return () => {
      window.removeEventListener('online', fn)
      window.removeEventListener('offline', fn)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (menuRootRef.current && !menuRootRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const syncNow = async () => {
    setMenuOpen(false)
    await flushSyncQueue()
    navigate(0)
  }

  const doSignOut = () => {
    setMenuOpen(false)
    signOut()
  }

  const homeTo = isAdmin ? `/admin${adminQs}` : '/trainer'

  const onAdminClubChange = (e) => {
    const v = e.target.value
    const next = new URLSearchParams(searchParams)
    if (v) next.set('club', v)
    else next.delete('club')
    setSearchParams(next, { replace: true })
  }

  return (
    <header className="app-header">
      <div className="app-header__brand-slot">
        <Link
          to={homeTo}
          className="app-brand u-no-decoration"
          style={{ color: 'inherit' }}
          title={online ? 'Сеть: онлайн' : 'Сеть: офлайн'}
          aria-label={online ? 'Фитнес-дневник, подключение к сети есть' : 'Фитнес-дневник, нет подключения к сети'}
        >
          <span className={`app-brand-mark ${online ? 'app-brand-mark--online' : 'app-brand-mark--offline'}`} aria-hidden>
            <i className="fas fa-dumbbell app-brand-mark__fa-icon" aria-hidden />
          </span>
          <span className="app-brand-text">Фитнес-дневник</span>
        </Link>
      </div>
      <nav className="app-header__nav" aria-label="Разделы">
        {isAdmin ? (
          <>
            <NavLink to={`/admin${adminQs}`} end className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <LayoutDashboard size={18} aria-hidden />
                Главная
              </span>
            </NavLink>
            <NavLink to={`/admin/structure${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <Building2 size={18} aria-hidden />
                Структура
              </span>
            </NavLink>
            <NavLink to={`/admin/clients${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <UserCircle size={18} aria-hidden />
                Клиенты
              </span>
            </NavLink>
            <NavLink to={`/admin/exercises${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <BookOpen size={18} aria-hidden />
                Упражнения
              </span>
            </NavLink>
            <NavLink to={`/admin/challenges${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <Trophy size={18} aria-hidden />
                Челленджи
              </span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/trainer" end className={headerNavClass}>
              Главная
            </NavLink>
            <NavLink to="/trainer/profile" className={headerNavClass}>
              Профиль
            </NavLink>
            <NavLink to="/trainer/clients" className={headerNavClass}>
              Клиенты
            </NavLink>
          </>
        )}
      </nav>
      <div className="app-header__right" ref={menuRootRef}>
        {showAdminClubSelect ? (
          <select
            className="app-header__club-select"
            value={adminClubValue}
            onChange={onAdminClubChange}
            aria-label="Клуб"
            title="Клуб"
          >
            <option value="">Все клубы</option>
            {adminClubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost app-header__action app-header__burger"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-controls="app-header-account-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Menu size={22} aria-hidden />
          <span className="sr-only">Меню аккаунта</span>
        </button>
        {menuOpen && (
          <div id="app-header-account-menu" className="app-header__dropdown" role="region" aria-label="Аккаунт и синхронизация">
            <div className="app-header__menu-nav" aria-label="Разделы">
              {isAdmin ? (
                <>
                  <NavLink to={`/admin${adminQs}`} end className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Главная
                  </NavLink>
                  <NavLink to={`/admin/structure${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Структура
                  </NavLink>
                  <NavLink to={`/admin/clients${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Клиенты
                  </NavLink>
                  <NavLink to={`/admin/exercises${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Упражнения
                  </NavLink>
                  <NavLink to={`/admin/challenges${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Челленджи
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/trainer" end className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Главная
                  </NavLink>
                  <NavLink to="/trainer/profile" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Профиль
                  </NavLink>
                  <NavLink to="/trainer/clients" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Клиенты
                  </NavLink>
                </>
              )}
            </div>
            <div className="app-header__menu-user">
              <User size={16} aria-hidden className="app-header__menu-user-icon" />
              <div className="app-header__menu-user-text">
                <span className="app-header__menu-user-name">
                  {user?.name ?? user?.email ?? '—'}
                  {!supabaseReady && ' · локально'}
                </span>
              </div>
            </div>
            <button type="button" className="app-header__menu-item" onClick={() => void syncNow()}>
              <RefreshCw size={18} aria-hidden />
              Синхронизировать
            </button>
            <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={doSignOut}>
              <LogOut size={18} aria-hidden />
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
