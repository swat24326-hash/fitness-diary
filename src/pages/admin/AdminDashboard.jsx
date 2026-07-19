import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Building2, ClipboardList, Shield, Sparkles, Stethoscope, TrendingUp, Trophy, UserCircle, UserPlus } from 'lucide-react'
import { AdminClubDaySummaryPanel } from '../../components/admin/AdminClubDaySummaryPanel'
import { ManagerPnkHomeGlance } from '../../components/pnk/ManagerPnkHomeGlance'
import { dispatchLocalDataChanged } from '../../lib/dataAccess'
import { loadAdminClubDaySummary } from '../../lib/admin/adminClubDaySummaryService'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'
import { shouldReloadAdminDaySummary } from '../../lib/admin/adminClubDaySummaryCore'
import '../../styles/pnk-funnel.css'

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

  const [daySummary, setDaySummary] = useState(null)
  const [daySummaryLoading, setDaySummaryLoading] = useState(false)
  const daySummaryGenRef = useRef(0)

  const loadDaySummary = useCallback(async ({ silent = false } = {}) => {
    if (!isAdminHome) return
    const gen = ++daySummaryGenRef.current
    if (!clubId) {
      setDaySummary(null)
      setDaySummaryLoading(false)
      return
    }
    if (!silent) setDaySummaryLoading(true)
    try {
      const res = await loadAdminClubDaySummary(clubId)
      if (gen !== daySummaryGenRef.current) return
      setDaySummary(res.ok ? res.summary : null)
    } catch {
      if (gen !== daySummaryGenRef.current) return
      setDaySummary(null)
    } finally {
      if (gen === daySummaryGenRef.current && !silent) setDaySummaryLoading(false)
    }
  }, [clubId, isAdminHome])

  useEffect(() => {
    void loadDaySummary()
    return () => {
      daySummaryGenRef.current += 1
    }
  }, [loadDaySummary])

  useDebouncedStorageReload(() => loadDaySummary({ silent: true }), { shouldRun: shouldReloadAdminDaySummary })

  return (
    <div className={`admin-home${isAdminHome ? ' admin-home--dashboard' : ' admin-home--section'}`}>
      {isAdminHome ? (
        <>
          <div className="admin-home__brand-block">
            <div className="admin-home__brand-row">
              <Shield className="admin-home__brand-icon" size={28} strokeWidth={2.25} aria-hidden />
              <h1 className="admin-home__brand-title">Админпанель</h1>
            </div>
            <p className="admin-path-head__lead admin-home__brand-lead">
              Управление клубом: сводка дня, разделы и контроль.
            </p>
          </div>

          <AdminClubDaySummaryPanel
            summary={daySummary}
            clubId={clubId}
            loading={daySummaryLoading}
            noClub={!clubId}
          />

          {clubId ? <ManagerPnkHomeGlance clubId={clubId} href={tab('pnk')} /> : null}

          <h2 className="admin-home__tiles-heading" id="admin-home-sections">
            Разделы
          </h2>
          <section className="admin-home__tiles" aria-labelledby="admin-home-sections">
            <div className="tile-grid admin-home__tile-grid">
              <NavLink
                to={tab('pnk')}
                className={({ isActive }) =>
                  `${adminTileClass({ isActive })} feature-tile--pnk`
                }
              >
                <div className="feature-tile__icon">
                  <UserPlus size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">ПНК</p>
              </NavLink>
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
              <NavLink to={tab('statistics')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <BarChart3 size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Статистика</p>
              </NavLink>
              <NavLink to={tab('sales')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <TrendingUp size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Продажи</p>
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
              <NavLink to={tab('iskra-settings')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <Sparkles size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">ИСКРА</p>
              </NavLink>
              <NavLink to={tab('club-tasks')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <ClipboardList size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Планёрка</p>
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
