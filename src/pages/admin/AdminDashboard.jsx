import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useCallback, useMemo, useState } from 'react'
import { BarChart3, Building2, CalendarDays, ClipboardList, FileSpreadsheet, Gift, Phone, Settings, Shield, Trash2, TrendingUp, Trophy, UserCircle, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AdminClubDaySummaryPanel } from '../../components/admin/AdminClubDaySummaryPanel'
import { AdminHomeAttentionRow } from '../../components/admin/AdminHomeAttentionRow'
import { ClubCallShiftSummaryPanel } from '../../components/admin/ClubCallShiftSummaryPanel'
import { dispatchLocalDataChanged } from '../../lib/dataAccess'
import { loadAdminClubDaySummary } from '../../lib/admin/adminClubDaySummaryService'
import { loadClubCallShiftSummary } from '../../lib/admin/clubCallShiftSummaryService'
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
import {
  clubCallShiftGlanceLooksSame,
  isClubCallShiftGlanceFresh,
  peekClubCallShiftGlanceSession,
  readClubCallShiftGlanceSession,
  writeClubCallShiftGlanceSession,
} from '../../lib/admin/clubCallShiftGlanceSession.js'
import { useStaleWhileRevalidate } from '../../hooks/useStaleWhileRevalidate.js'
import { HOME_GLANCE_CLOUD_MS, withHomeGlanceTimeout } from '../../lib/admin/adminHomeGlanceTimeout.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import { isSupabaseConfigured } from '../../lib/supabase'
import { isAppOnline } from '../../lib/syncService'
import '../../styles/pnk-funnel.css'
import '../../styles/club-call.css'

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

export function AdminDashboard({ accessMode = 'admin' } = {}) {
  const { user } = useAuth()
  const [search] = useSearchParams()
  const location = useLocation()
  const isSupervisor = accessMode === 'supervisor'
  const basePath = isSupervisor ? '/club' : '/admin'

  const reloadClubs = useCallback(() => {
    dispatchLocalDataChanged({ reason: 'clubs-refresh' })
  }, [])

  const clubId = isSupervisor
    ? String(user?.club_id ?? '').trim()
    : search.get('club') ?? ''
  const clubQs = !isSupervisor && clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  const tab = (path) => `${basePath}/${path}${clubQs}`

  const isAdminHome = useMemo(() => {
    const p = (location.pathname || '/').replace(/\/$/, '') || '/'
    return p === basePath
  }, [location.pathname, basePath])

  const [attentionWidgets, setAttentionWidgets] = useState({
    hasPnk: false,
    hasPlanerka: false,
    sideCount: 0,
  })
  const [callShiftNotice, setCallShiftNotice] = useState('')

  const clubDayIso = todayInTimeZoneIso()

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
    try {
      const range = getDateRange('month')
      const api = await withHomeGlanceTimeout(
        fetchCoachQualityViaApi({
          clubId,
          dateFrom: range.start,
          dateTo: range.end,
          mode: 'glance',
        }),
        HOME_GLANCE_CLOUD_MS,
      )
      return glanceFromCoachQualityApi(api)
    } catch {
      return null
    }
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
    () => (clubId ? peekDaySummaryGlanceSession(clubId, clubDayIso) : null),
    [clubId, clubDayIso],
  )
  const readDay = useCallback(
    () => (clubId ? readDaySummaryGlanceSession(clubId, clubDayIso) : null),
    [clubId, clubDayIso],
  )
  const writeDay = useCallback(
    (summary) => {
      if (clubId) writeDaySummaryGlanceSession(clubId, clubDayIso, summary)
    },
    [clubId, clubDayIso],
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
    deps: [clubId, clubDayIso],
    peek: peekDay,
    read: readDay,
    write: writeDay,
    isFresh: isDaySummaryGlanceFresh,
    looksSame: daySummaryGlanceLooksSame,
    fetcher: fetchDaySummary,
  })

  const peekShift = useCallback(
    () => (clubId ? peekClubCallShiftGlanceSession(clubId, clubDayIso) : null),
    [clubId, clubDayIso],
  )
  const readShift = useCallback(
    () => (clubId ? readClubCallShiftGlanceSession(clubId, clubDayIso) : null),
    [clubId, clubDayIso],
  )
  const writeShift = useCallback(
    (summary) => {
      if (clubId) writeClubCallShiftGlanceSession(clubId, clubDayIso, summary)
    },
    [clubId, clubDayIso],
  )
  const fetchShiftSummary = useCallback(async () => {
    if (!clubId) {
      setCallShiftNotice('')
      return null
    }
    const res = await loadClubCallShiftSummary(clubId, { day: clubDayIso })
    if (!res.ok) {
      const cached = peekClubCallShiftGlanceSession(clubId, clubDayIso)
      if (res.reason === 'offline') {
        setCallShiftNotice(
          cached ? 'Нет сети — на экране сохранённые цифры' : 'Нет сети — сводку загрузить нельзя',
        )
      } else {
        setCallShiftNotice(
          String(res.reason || 'Облако недоступно — цифры за день не загрузились'),
        )
      }
      // null → SWR сохраняет last-good; без кэша панель покажет нули + текст ошибки
      return null
    }
    setCallShiftNotice(res.partial ? String(res.reason || '') : '')
    return res.summary
  }, [clubId, clubDayIso])

  const {
    data: callShiftSummary,
    loading: callShiftLoading,
    reload: reloadCallShift,
  } = useStaleWhileRevalidate({
    enabled: isAdminHome && Boolean(clubId),
    deps: [clubId, clubDayIso],
    peek: peekShift,
    read: readShift,
    write: writeShift,
    isFresh: isClubCallShiftGlanceFresh,
    looksSame: clubCallShiftGlanceLooksSame,
    fetcher: fetchShiftSummary,
  })

  const softSignals = useMemo(
    () =>
      buildAdminHomeSoftSignals({
        summary: daySummary,
        coachQuality: coachQualityHome,
        clubId,
        clientsPath: `${basePath}/clients`,
        statsPath: `${basePath}/statistics`,
      }),
    [daySummary, coachQualityHome, clubId, basePath],
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
      void reloadCallShift({ force: true })
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

          <div className="admin-home-summaries">
            <AdminClubDaySummaryPanel
              summary={daySummary}
              clubId={clubId}
              clientsPath={`${basePath}/clients`}
              statsPath={`${basePath}/statistics`}
              loading={daySummaryLoading}
              noClub={!clubId}
              coachQuality={coachQualityHome}
              coachQualityLoading={coachQualityHomeLoading}
              coachQualityHeroInAttention={Boolean(coachQualityHome) || coachQualityHomeLoading}
            />

            <ClubCallShiftSummaryPanel
              summary={callShiftSummary}
              journalHref={tab('call-log')}
              loading={callShiftLoading}
              noClub={!clubId}
              error={callShiftNotice}
            />
          </div>
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
              {isSupervisor ? (
                <NavLink to={tab('settings')} className={adminTileClass}>
                  <div className="feature-tile__icon">
                    <Settings size={44} aria-hidden />
                  </div>
                  <p className="feature-tile__title">Настройки</p>
                </NavLink>
              ) : (
                <NavLink to={tab('structure')} className={adminTileClass}>
                  <div className="feature-tile__icon">
                    <Building2 size={44} aria-hidden />
                  </div>
                  <p className="feature-tile__title">Структура</p>
                </NavLink>
              )}
              <NavLink to={tab('clients')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <UserCircle size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Клиенты</p>
              </NavLink>
              <NavLink to={tab('call-log')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <Phone size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Журнал звонков</p>
              </NavLink>
              <NavLink to={tab('trainer-schedule')} className={adminTileClass}>
                <div className="feature-tile__icon">
                  <CalendarDays size={44} aria-hidden />
                </div>
                <p className="feature-tile__title">Ежедневники</p>
              </NavLink>
              {!isSupervisor ? (
                <NavLink to={tab('deletion-log')} className={adminTileClass}>
                  <div className="feature-tile__icon">
                    <Trash2 size={44} aria-hidden />
                  </div>
                  <p className="feature-tile__title">Журнал удалений</p>
                </NavLink>
              ) : null}
              {!isSupervisor ? (
                <NavLink to={tab('loyalty')} className={adminTileClass}>
                  <div className="feature-tile__icon">
                    <Gift size={44} aria-hidden />
                  </div>
                  <p className="feature-tile__title">Журнал баллов</p>
                </NavLink>
              ) : null}
              {!isSupervisor ? (
                <NavLink to={tab('excel-lists')} className={adminTileClass}>
                  <div className="feature-tile__icon">
                    <FileSpreadsheet size={44} aria-hidden />
                  </div>
                  <p className="feature-tile__title">Списки из Excel</p>
                </NavLink>
              ) : null}
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
