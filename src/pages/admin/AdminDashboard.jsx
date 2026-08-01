import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useCallback, useMemo, useState } from 'react'
import { BarChart3, Building2, ClipboardList, FileSpreadsheet, Shield, TrendingUp, Trophy, UserCircle, UserPlus } from 'lucide-react'
import { AdminClubDaySummaryPanel } from '../../components/admin/AdminClubDaySummaryPanel'
import { AdminHomeAttentionRow } from '../../components/admin/AdminHomeAttentionRow'
import { dispatchLocalDataChanged } from '../../lib/dataAccess'
import { loadAdminClubDaySummary } from '../../lib/admin/adminClubDaySummaryService'
import { fetchCoachQualityViaApi } from '../../lib/admin/adminApiClient'
import { buildAdminHomeSoftSignals } from '../../lib/admin/adminHomeSoftSignalsCore.js'
import { getDateRange } from '../../lib/period'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'
import { shouldReloadAdminDaySummary } from '../../lib/admin/adminClubDaySummaryCore'
import {
  coachQualityGlanceLooksSame,
  isCoachQualityGlanceFresh,
  peekCoachQualityGlanceSession,
  readCoachQualityGlanceSession,
  writeCoachQualityGlanceSession,
} from '../../lib/admin/coachQualityGlanceSession.js'
import {
  daySummaryGlanceLooksSame,
  isDaySummaryGlanceFresh,
  peekDaySummaryGlanceSession,
  readDaySummaryGlanceSession,
  writeDaySummaryGlanceSession,
} from '../../lib/admin/daySummaryGlanceSession.js'
import { useStaleWhileRevalidate } from '../../hooks/useStaleWhileRevalidate.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { isSupabaseConfigured } from '../../lib/supabase'
import { isAppOnline } from '../../lib/syncService'
import '../../styles/pnk-funnel.css'

function glanceFromCoachQualityApi(api) {
  if (api?.glance) return api.glance
  if (!api?.coachQuality) return null
  return {
    scorePct: api.coachQuality.averageScorePct ?? null,
    chipLabel: api.coachQuality.brief?.chipLabel ?? null,
    hot:
      (Number(api.coachQuality.brief?.reviewCount) || 0) > 0 ||
      (Number(api.coachQuality.brief?.droppedCount) || 0) > 0,
    reviewCount: Number(api.coachQuality.brief?.reviewCount) || 0,
    attentionCount: Number(api.coachQuality.brief?.attentionCount) || 0,
    droppedCount: Number(api.coachQuality.brief?.droppedCount) || 0,
  }
}

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

  const [attentionWidgets, setAttentionWidgets] = useState({
    hasPnk: false,
    hasPlanerka: false,
    sideCount: 0,
  })

  const todayIso = todayLocalIso()

  const peekCq = useCallback(() => {
    if (!clubId) return null
    const range = getDateRange('month')
    return peekCoachQualityGlanceSession(clubId, range.start, range.end)
  }, [clubId])
  const readCq = useCallback(() => {
    if (!clubId) return null
    const range = getDateRange('month')
    const row = readCoachQualityGlanceSession(clubId, range.start, range.end)
    if (!row) return null
    return { payload: row.glance, savedAt: row.savedAt }
  }, [clubId])
  const writeCq = useCallback(
    (glance) => {
      if (!clubId) return
      const range = getDateRange('month')
      writeCoachQualityGlanceSession(clubId, range.start, range.end, glance)
    },
    [clubId],
  )
  const fetchCqGlance = useCallback(async () => {
    if (!clubId || !isSupabaseConfigured() || !isAppOnline()) return null
    const range = getDateRange('month')
    const api = await fetchCoachQualityViaApi({
      clubId,
      dateFrom: range.start,
      dateTo: range.end,
      mode: 'glance',
    })
    return glanceFromCoachQualityApi(api)
  }, [clubId])

  const {
    data: coachQualityHome,
    loading: coachQualityHomeLoading,
    reload: reloadCoachQualityHome,
  } = useStaleWhileRevalidate({
    enabled: isAdminHome && Boolean(clubId),
    deps: [clubId],
    peek: peekCq,
    read: readCq,
    write: writeCq,
    isFresh: isCoachQualityGlanceFresh,
    looksSame: coachQualityGlanceLooksSame,
    fetcher: fetchCqGlance,
  })

  const peekDay = useCallback(
    () => (clubId ? peekDaySummaryGlanceSession(clubId, todayIso) : null),
    [clubId, todayIso],
  )
  const readDay = useCallback(
    () => (clubId ? readDaySummaryGlanceSession(clubId, todayIso) : null),
    [clubId, todayIso],
  )
  const writeDay = useCallback(
    (summary) => {
      if (clubId) writeDaySummaryGlanceSession(clubId, todayIso, summary)
    },
    [clubId, todayIso],
  )
  const fetchDaySummary = useCallback(async () => {
    if (!clubId) return null
    const res = await loadAdminClubDaySummary(clubId)
    return res.ok ? res.summary : null
  }, [clubId])

  const {
    data: daySummary,
    loading: daySummaryLoading,
    reload: reloadDaySummary,
  } = useStaleWhileRevalidate({
    enabled: isAdminHome && Boolean(clubId),
    deps: [clubId, todayIso],
    peek: peekDay,
    read: readDay,
    write: writeDay,
    isFresh: isDaySummaryGlanceFresh,
    looksSame: daySummaryGlanceLooksSame,
    fetcher: fetchDaySummary,
  })

  const softSignals = useMemo(
    () =>
      buildAdminHomeSoftSignals({
        summary: daySummary,
        coachQuality: coachQualityHome,
        clubId,
      }),
    [daySummary, coachQualityHome, clubId],
  )

  const onWidgetsPresence = useCallback((info) => {
    setAttentionWidgets({
      hasPnk: Boolean(info?.hasPnk),
      hasPlanerka: Boolean(info?.hasPlanerka),
      sideCount: Number(info?.sideCount) || 0,
    })
  }, [])

  useDebouncedStorageReload(
    () => {
      void reloadDaySummary({ force: true })
      void reloadCoachQualityHome({ force: true })
    },
    { shouldRun: shouldReloadAdminDaySummary },
  )

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

          {clubId ? (
            <AdminHomeAttentionRow
              clubId={clubId}
              hrefPnk={tab('pnk')}
              hrefPlanerka={tab('club-tasks')}
              softSignals={softSignals}
              onWidgetsPresence={onWidgetsPresence}
            />
          ) : null}

          <AdminClubDaySummaryPanel
            summary={daySummary}
            clubId={clubId}
            loading={daySummaryLoading}
            noClub={!clubId}
            coachQuality={coachQualityHome}
            coachQualityLoading={coachQualityHomeLoading}
          />

          <h2 className="admin-home__tiles-heading" id="admin-home-sections">
            Разделы
          </h2>
          <section className="admin-home__tiles" aria-labelledby="admin-home-sections">
            <div className="tile-grid admin-home__tile-grid">
              <NavLink
                to={tab('pnk')}
                className={({ isActive }) =>
                  `${adminTileClass({ isActive })} feature-tile--pnk${attentionWidgets.hasPnk ? ' feature-tile--echo' : ''}`
                }
                title={attentionWidgets.hasPnk ? 'ПНК уже на главной выше' : undefined}
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
              <NavLink to={tab('excel-lists')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <FileSpreadsheet size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Excel-списки</p>
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
              <NavLink
                to={tab('club-tasks')}
                className={({ isActive }) =>
                  `${adminTileClass({ isActive })}${attentionWidgets.hasPlanerka ? ' feature-tile--echo' : ''}`
                }
                title={attentionWidgets.hasPlanerka ? 'Планёрка уже на главной выше' : undefined}
              >
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
