import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useCallback, useMemo } from 'react'
import { BookOpen, Building2, Stethoscope, Trophy, UserCircle } from 'lucide-react'
import { dispatchLocalDataChanged } from '../../lib/dataAccess'

function adminTileClass({ isActive }) {
  return `feature-tile u-no-decoration${isActive ? ' feature-tile--active' : ''}`
}

export function AdminDashboard() {
  const [search] = useSearchParams()
  const location = useLocation()

  const reloadClubs = useCallback(() => {
    dispatchLocalDataChanged({ reason: 'clubs-refresh' })
  }, [])

  const clubId = search.get('club') ?? ''
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  const tab = (path) => `/admin/${path}${clubQs}`

  const isAdminHome = useMemo(() => {
    const p = (location.pathname || '/').replace(/\/$/, '') || '/'
    return p === '/admin'
  }, [location.pathname])

  return (
    <div className={`admin-home${isAdminHome ? ' admin-home--dashboard' : ' admin-home--section'}`}>
      {isAdminHome ? (
        <>
          <div className="admin-home__brand-row">
            <i className="fas fa-shield-halved admin-home__brand-icon" aria-hidden />
            <h1 className="admin-home__brand-title">Админпанель</h1>
          </div>
          <h2 className="admin-home__tiles-heading" id="admin-home-sections">
            Разделы
          </h2>
          <section className="admin-home__tiles" aria-labelledby="admin-home-sections">
            <div className="tile-grid admin-home__tile-grid">
              <NavLink to={tab('structure')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <Building2 size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Структура</p>
              </NavLink>
              <NavLink to={tab('clients')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <UserCircle size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Клиенты</p>
              </NavLink>
              <NavLink to={tab('exercises')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <BookOpen size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Упражнения</p>
              </NavLink>
              <NavLink to={tab('challenges')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <Trophy size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Челленджи</p>
              </NavLink>
              <NavLink to={tab('diagnostics')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <Stethoscope size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Диагностика</p>
              </NavLink>
            </div>
          </section>
        </>
      ) : null}

      <div className="admin-home__outlet">
        <Outlet context={{ clubId, reloadClubs }} />
      </div>
    </div>
  )
}
