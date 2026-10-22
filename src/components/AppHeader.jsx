import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { subscribeNetworkStatus } from '../lib/networkReachability'
import { isAppOnline } from '../lib/syncService'
import { isSupabaseConfigured } from '../lib/supabase'
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { BarChart3, Bell, CalendarDays, LayoutDashboard, LogOut, Menu, RefreshCw, Trophy, TrendingUp, UserCircle, Building2 } from 'lucide-react'
import { HeaderClubSwitcher } from './header/HeaderClubSwitcher.jsx'
import { HeaderProfileSheet } from './header/HeaderProfileSheet.jsx'
import { HeaderProfileSettings } from './header/HeaderProfileSettings.jsx'
import { HeaderJournalMenuItem } from './header/HeaderJournalMenuItem.jsx'
import { ProfileMenuRow } from './profile/ProfileMenuRow.jsx'
import { staffAvatarApi } from '../lib/profile/staffAvatarApi.js'
import { useMyAvatar } from '../hooks/useMyAvatar.js'
import { useAdminClubContext } from './header/useAdminClubContext.js'
import { IskraOrb } from './iskra/IskraOrb.jsx'
import { productBrandDocumentTitle } from '../lib/productBrand.js'
import { LOCAL_DATA_CHANGED, resolveClubDisplayName } from '../lib/dataAccess'
import { HeaderStopwatch } from './HeaderStopwatch'
import { HeaderHeartRate } from './HeaderHeartRate'
import { AppErrorJournalModal } from './AppErrorJournalModal'
import { useIskraPanel } from '../context/IskraPanelContext.jsx'
import { useHeaderSync } from './useHeaderSync'
import { useStaffPushSelfHeal } from '../hooks/useStaffPushSelfHeal.js'
import { SyncMottoStrip } from './SyncMottoStrip'
import { TrainerInboxPanel } from './iskra/TrainerInboxPanel.jsx'
import { StaffInboxButton } from './inbox/StaffInboxButton.jsx'
import { HeaderDeviceHealthButton } from './HeaderDeviceHealthButton.jsx'
import { HeaderHelpButton } from './HeaderHelpButton.jsx'
import { fetchIskraDispatch } from '../lib/admin/iskraDispatchService.js'
import { TRAINER_INBOX_OPEN_EVENT } from '../lib/admin/trainerInboxEvents.js'
import { useTrainerNotifications } from '../pages/trainer/useTrainerNotifications.js'
import {
  trainerInboxHeaderBadgeCount,
  trainerInboxHeaderLabelRu,
} from '../lib/trainer/trainerNotificationsCore.js'
import { recoverApp } from '../lib/appLifecycle'
import { subscribeAppUpdatePending } from '../lib/appUpdateState'
import { consumeReopenMyProfileState } from '../lib/profile/myProfileEvents.js'
import { resolveHeaderAttentionTarget } from '../lib/headerAttentionTarget.js'

const GeminiAnalyticsPanel = lazy(() =>
  import('./GeminiAnalyticsPanel.jsx').then((m) => ({ default: m.GeminiAnalyticsPanel })),
)

function headerNavClass({ isActive }) {
  return `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
}

function menuNavClass({ isActive }) {
  return `app-header__menu-link${isActive ? ' app-header__menu-link--active' : ''}`
}

export function AppHeader() {
  const { user, signOut, isAdmin, isSalesManager, isSupervisor, supabaseReady, refreshUserProfile, refreshSessionOnWake } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? isAppOnline() : true))
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const [profileOpen, setProfileOpen] = useState(false)
  const openProfile = useCallback(() => setProfileOpen(true), [])
  const closeProfile = useCallback(() => setProfileOpen(false), [])

  useEffect(() => {
    consumeReopenMyProfileState(location, navigate)
  }, [location, navigate])
  const myName = user?.name ?? user?.email ?? ''
  const myAvatar = useMyAvatar(staffAvatarApi, `u:${user?.id ?? ''}`)
  const {
    mode: iskraMode,
    trainerId: geminiTrainerId,
    trainerName: geminiTrainerName,
    initialMessage: geminiInitialMessage,
    openIskra,
    expandIskra,
    minimizeIskra,
    closeIskra,
  } = useIskraPanel()
  const menuRootRef = useRef(null)
  /** Название клуба тренера (adminClubs грузится только на /admin). */
  const [trainerClubLabel, setTrainerClubLabel] = useState(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxPending, setInboxPending] = useState(0)
  const [inboxTab, setInboxTab] = useState(/** @type {'planerka' | 'clients'} */ ('clients'))
  const [updatePending, setUpdatePending] = useState(false)
  const [recoverBusy, setRecoverBusy] = useState(false)
  const isTrainerRole = !isAdmin && !isSalesManager && !isSupervisor
  const { unread: clientsUnread } = useTrainerNotifications(Boolean(isTrainerRole && user))
  useStaffPushSelfHeal(String(user?.club_id ?? '').trim(), Boolean(user && supabaseReady))

  const {
    showHeaderSync,
    syncOutboundTotal,
    syncHasPending,
    syncOutboundLabelShort,
    syncBtnClass,
    syncBtnTitle,
    syncMenuLabel,
    syncBusy,
    syncProgress,
    syncNow,
    syncFeedback,
    showSyncFeedback,
    needsAttention,
    persistentErrorCount,
    errorJournalOpen,
    setErrorJournalOpen,
    openErrorJournal,
  } = useHeaderSync({ user, isAdmin, isSalesManager: isSalesManager || isSupervisor, supabaseReady, searchParams, menuOpen, closeMenu })
  const menuAttention = resolveHeaderAttentionTarget({
    syncPending: syncHasPending,
    needsAttention,
    updatePending,
    persistentErrors: persistentErrorCount,
  })

  const showAdminClubSelect = isAdmin && location.pathname.startsWith('/admin')
  const adminClub = useAdminClubContext({
    enabled: isAdmin,
    onAdminRoute: showAdminClubSelect,
    userId: user?.id,
    supabaseReady,
    searchParams,
    setSearchParams,
  })
  /** Вне /admin (мессенджер) — последний клуб, чтобы «Главная» и ИСКРА вели туда же. */
  const adminClubValue = showAdminClubSelect ? (searchParams.get('club') ?? '') : adminClub.clubId
  const adminQs = useMemo(() => (adminClubValue ? `?club=${encodeURIComponent(adminClubValue)}` : ''), [adminClubValue])
  const salesReportActive = searchParams.get('tab') === 'report'
  const salesStatsActive = searchParams.get('tab') === 'stats'
  const salesAnalyticsActive = searchParams.get('tab') === 'analytics'
  const salesHomeActive =
    location.pathname === '/sales' && !salesReportActive && !salesStatsActive && !salesAnalyticsActive

  useEffect(() => subscribeAppUpdatePending(setUpdatePending), [])

  useEffect(() => {
    if (isAdmin) {
      setTrainerClubLabel(null)
      return
    }
    const cid = String(user?.club_id ?? '').trim()
    if (!cid) {
      setTrainerClubLabel('—')
      return
    }
    let alive = true
    const resolve = async () => {
      try {
        const name = await resolveClubDisplayName(cid)
        if (alive) setTrainerClubLabel(name)
      } catch {
        if (alive) setTrainerClubLabel(cid)
      }
    }
    void resolve()
    const onData = () => {
      void resolve()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => {
      alive = false
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
    }
  }, [isAdmin, user?.club_id])

  const isTrainer = !isAdmin && !isSalesManager && !isSupervisor && !!user
  const isDispatchInboxUser = (isTrainer || isSalesManager || isSupervisor) && !!user

  useEffect(() => {
    if (!isDispatchInboxUser || !supabaseReady) {
      setInboxPending(0)
      return
    }
    let alive = true
    const load = async () => {
      try {
        const cid = String(user?.club_id ?? '').trim()
        const data = await fetchIskraDispatch({ clubId: cid || undefined, view: 'inbox', status: 'pending', limit: 5 })
        if (alive) setInboxPending(Number(data?.pending_count) || 0)
      } catch {
        if (alive) setInboxPending(0)
      }
    }
    void load()
    const t = window.setInterval(() => void load(), 120_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [isDispatchInboxUser, supabaseReady, user?.club_id, online, inboxOpen])

  useEffect(() => {
    if (!isDispatchInboxUser) return
    const onOpen = (e) => {
      const raw = e?.detail?.tab
      const tab =
        raw === 'planerka'
          ? 'planerka'
          : isTrainerRole
            ? 'clients'
            : 'planerka'
      setInboxTab(tab)
      setInboxOpen(true)
    }
    window.addEventListener(TRAINER_INBOX_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(TRAINER_INBOX_OPEN_EVENT, onOpen)
  }, [isDispatchInboxUser, isTrainerRole])

  useEffect(() => {
    if (!isDispatchInboxUser) return
    const inbox = searchParams.get('inbox')
    if (inbox === '1' || inbox === 'clients' || inbox === 'planerka') {
      setInboxTab(
        inbox === 'planerka' || !isTrainerRole
          ? 'planerka'
          : 'clients',
      )
      setInboxOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('inbox')
      setSearchParams(next, { replace: true })
    }
  }, [isDispatchInboxUser, isTrainerRole, searchParams, setSearchParams])

  useEffect(() => subscribeNetworkStatus(setOnline), [])

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

  const doSignOut = () => {
    setMenuOpen(false)
    signOut()
  }

  const doRecoverApp = async () => {
    if (recoverBusy) return
    setRecoverBusy(true)
    try {
      await recoverApp({
        refreshSession: refreshSessionOnWake,
        refreshProfile: refreshUserProfile,
      })
    } catch {
      showSyncFeedback('Не удалось восстановить — откройте Помощь', 'warn')
    } finally {
      setRecoverBusy(false)
      setMenuOpen(false)
    }
  }

  const homeTo = isAdmin ? `/admin${adminQs}` : isSalesManager ? '/sales' : isSupervisor ? '/club' : '/trainer'

  const journalContext = useMemo(() => {
    const clubId = isAdmin ? adminClubValue : String(user?.club_id ?? '').trim()
    const club = adminClub.clubs.find((c) => String(c.id) === clubId)
    return {
      user,
      role: isAdmin ? 'admin' : isSalesManager ? 'sales_manager' : isSupervisor ? 'supervisor' : 'trainer',
      isAdmin,
      online,
      supabaseReady: supabaseReady && isSupabaseConfigured(),
      clubId: clubId || '—',
      clubName: isAdmin
        ? (club?.name?.trim() || (clubId && clubId !== '—' ? clubId : '—'))
        : trainerClubLabel === null
          ? '…'
          : trainerClubLabel,
      pathname: location.pathname + location.search,
    }
  }, [
    user,
    isAdmin,
    isSalesManager,
    isSupervisor,
    online,
    supabaseReady,
    adminClubValue,
    adminClub.clubs,
    trainerClubLabel,
    location.pathname,
    location.search,
  ])

  const adminClubName = adminClub.clubName

  /** В шапке герой — клуб; продукт только микро-знаком (docs/BRAND_SYSTEM.md). */
  const headerClubTitle = isAdmin
    ? adminClubName ||
      (adminClub.loading && adminClub.clubs.length === 0 ? '…' : showAdminClubSelect ? 'Выберите клуб' : 'Все клубы')
    : trainerClubLabel === null
      ? '…'
      : trainerClubLabel || '—'

  useEffect(() => {
    if (isSalesManager) {
      const club =
        trainerClubLabel && trainerClubLabel !== '…' ? String(trainerClubLabel).trim() : ''
      document.title = club ? `Продажи · ${club}` : 'Продажи'
      return
    }
    document.title = productBrandDocumentTitle(headerClubTitle)
  }, [isSalesManager, trainerClubLabel, headerClubTitle])

  return (
    <>
    <header
      className={[
        'app-header',
        isAdmin ? 'app-header--admin' : 'app-header--trainer',
        isAdmin || isSupervisor ? 'app-header--staff' : '',
        showAdminClubSelect ? 'app-header--with-club' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="app-header__brand-slot">
        {isSalesManager ? (
          <Link
            to="/sales"
            className="sales-header__brand u-no-decoration"
            style={{ color: 'inherit' }}
            title={online ? 'Продажи — онлайн' : 'Продажи — офлайн'}
            aria-label={online ? 'Продажи, подключение к сети есть' : 'Продажи, нет подключения к сети'}
          >
            <TrendingUp size={22} aria-hidden className="sales-header__brand-icon" />
            <div>
              <span className="sales-header__title">Продажи</span>
              {user?.club_id ? (
                <span className="sales-header__club" title="Ваш клуб">
                  {trainerClubLabel === null ? '…' : trainerClubLabel || user.club_id}
                </span>
              ) : null}
            </div>
          </Link>
        ) : (
          <HeaderClubSwitcher
            title={headerClubTitle}
            clubs={adminClub.clubs}
            clubId={adminClub.clubId}
            online={online}
            switchable={isAdmin && adminClub.switchable}
            homeTo={homeTo}
            homeTitle={isAdmin && !showAdminClubSelect && adminClubName ? `Вернуться в клуб «${adminClubName}»` : ''}
            onSelect={adminClub.selectClub}
          />
        )}
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
            <NavLink to={`/admin/statistics${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <BarChart3 size={18} aria-hidden />
                Статистика
              </span>
            </NavLink>
            <NavLink to={`/admin/sales${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <TrendingUp size={18} aria-hidden />
                Продажи
              </span>
            </NavLink>
            <NavLink to={`/admin/challenges${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <Trophy size={18} aria-hidden />
                Челленджи
              </span>
            </NavLink>
          </>
        ) : isSupervisor ? (
          <>
            <NavLink to="/club" end className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <LayoutDashboard size={18} aria-hidden />
                Главная
              </span>
            </NavLink>
            <NavLink to="/club/clients" className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <UserCircle size={18} aria-hidden />
                Клиенты
              </span>
            </NavLink>
            <NavLink to="/club/statistics" className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <BarChart3 size={18} aria-hidden />
                Статистика
              </span>
            </NavLink>
            <NavLink to="/club/sales" className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <TrendingUp size={18} aria-hidden />
                Продажи
              </span>
            </NavLink>
            <NavLink to="/club/settings" className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <Building2 size={18} aria-hidden />
                Настройки
              </span>
            </NavLink>
          </>
        ) : isSalesManager ? (
          <>
            <NavLink to="/sales" end className={() => headerNavClass({ isActive: salesHomeActive })}>
              Главная
            </NavLink>
            <NavLink to="/sales?tab=report" className={() => headerNavClass({ isActive: salesReportActive })}>
              Отчёт
            </NavLink>
            <NavLink to="/sales?tab=stats" className={() => headerNavClass({ isActive: salesStatsActive })}>
              Статистика
            </NavLink>
            <NavLink to="/sales?tab=analytics" className={() => headerNavClass({ isActive: salesAnalyticsActive })}>
              <span className="app-header__nav-with-icon">
                <TrendingUp size={18} aria-hidden />
                Аналитика
              </span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/trainer" end className={headerNavClass}>
              Главная
            </NavLink>
            <NavLink to="/trainer/calendar" className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <CalendarDays size={18} aria-hidden />
                Ежедневник
              </span>
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
        <div className="app-header__tools">
        {showAdminClubSelect ? (
          <button
            type="button"
            className={`btn btn-secondary btn-sm app-header__vasya-btn${iskraMode !== 'closed' ? ' app-header__vasya-btn--active' : ''}`}
            disabled={!adminClubValue}
            title={adminClubValue ? 'ЭВС «ИСКРА» — аналитика клуба' : 'Сначала выберите клуб'}
            aria-label={adminClubValue ? 'ЭВС «ИСКРА» — аналитика клуба' : 'Сначала выберите клуб'}
            onClick={() => openIskra({})}
          >
            <IskraOrb state="idle" size={26} className="app-header__vasya-orb" />
          </button>
        ) : null}
        {!isAdmin && !isSalesManager && !isSupervisor && user ? <HeaderHelpButton onOpen={openErrorJournal} /> : null}
        {!isAdmin && !isSalesManager && !isSupervisor && user ? <HeaderHeartRate /> : null}
        {!isAdmin && !isSalesManager && !isSupervisor && user ? <HeaderStopwatch /> : null}
        {isDispatchInboxUser && supabaseReady ? <StaffInboxButton /> : null}
        {isAdmin && user && supabaseReady ? <StaffInboxButton chatsOnly /> : null}
        {isAdmin && user && supabaseReady ? <HeaderDeviceHealthButton /> : null}
        {isDispatchInboxUser && supabaseReady ? (
          <button
            type="button"
            className={`btn btn-secondary btn-sm app-header__inbox-btn${inboxOpen ? ' app-header__inbox-btn--active' : ''}`}
            title={
              isTrainerRole
                ? trainerInboxHeaderLabelRu(inboxPending, clientsUnread)
                : inboxPending
                  ? `Планёрка: ${inboxPending} новых`
                  : 'Планёрка'
            }
            aria-label={
              isTrainerRole
                ? trainerInboxHeaderLabelRu(inboxPending, clientsUnread)
                : inboxPending
                  ? `Планёрка: ${inboxPending} новых заданий`
                  : 'Планёрка — мои задания'
            }
            onClick={() => {
              setInboxTab(isTrainerRole ? 'clients' : 'planerka')
              setInboxOpen(true)
            }}
          >
            <Bell size={20} strokeWidth={2} aria-hidden />
            {(() => {
              const n = isTrainerRole
                ? trainerInboxHeaderBadgeCount(inboxPending, clientsUnread)
                : inboxPending
              if (n <= 0) return null
              return (
                <span className="app-header__inbox-badge" aria-hidden>
                  {n > 99 ? '99+' : n}
                </span>
              )
            })()}
          </button>
        ) : null}
        {showHeaderSync ? (
          <div className={`app-header__sync-wrap${!syncBusy && !syncHasPending ? ' app-header__sync-wrap--quiet' : ''}`}>
            <button
              type="button"
              className={`${syncBtnClass}${syncHasPending && !syncBusy ? ' app-header__sync-btn--labeled' : ''}`}
              disabled={syncBusy}
              onClick={() => void syncNow()}
              title={syncBtnTitle}
              aria-label={syncBtnTitle}
              aria-busy={syncBusy}
            >
              <RefreshCw size={20} strokeWidth={2} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
              {syncBusy ? (
                <span className="app-header__sync-badge app-header__sync-badge--progress" aria-hidden>
                  {syncProgress.percent}%
                </span>
              ) : syncHasPending ? (
                <>
                  <span className="app-header__sync-badge" aria-hidden>
                    {syncOutboundTotal > 99 ? '99+' : syncOutboundTotal}
                  </span>
                  <span className="app-header__sync-label">{syncOutboundLabelShort}</span>
                </>
              ) : null}
            </button>
            {syncBusy ? (
              <div
                className="app-header__sync-progress"
                role="progressbar"
                aria-valuenow={syncProgress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={syncProgress.label || 'Синхронизация'}
              >
                <div className="app-header__sync-progress-bar" style={{ width: `${syncProgress.percent}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
        <button
          type="button"
          className={[
            'btn',
            'btn-ghost',
            'app-header__action',
            'app-header__burger',
            menuAttention.burger && !menuOpen ? 'app-header__burger--has-errors' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-controls="app-header-account-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Menu size={22} aria-hidden />
          {menuAttention.burger && !menuOpen ? (
            <span className="app-header__error-dot" aria-hidden title="Требует внимания: очередь sync или ошибка" />
          ) : null}
          <span className="sr-only">Меню аккаунта</span>
        </button>
        {menuOpen && (
          <div id="app-header-account-menu" className="app-header__dropdown" role="region" aria-label="Аккаунт и синхронизация">
            <ProfileMenuRow
              name={myName}
              avatar={myAvatar}
              hint="Мой профиль и настройки"
              attention={menuAttention.profile}
              onClick={() => {
                setMenuOpen(false)
                openProfile()
              }}
            >
              {!supabaseReady || (!isAdmin && !online) ? (
                <>
                  <br />
                  {!supabaseReady ? 'локально' : 'офлайн'}
                </>
              ) : null}
            </ProfileMenuRow>
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
                  <NavLink to={`/admin/statistics${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Статистика
                  </NavLink>
                  <NavLink to={`/admin/sales${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Продажи
                  </NavLink>
                  <NavLink to={`/admin/challenges${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Челленджи
                  </NavLink>
                  {supabaseReady ? (
                    <NavLink to={`/admin/health${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                      Сбои устройств
                    </NavLink>
                  ) : null}
                </>
              ) : isSupervisor ? (
                <>
                  <NavLink to="/club" end className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Главная
                  </NavLink>
                  <NavLink to="/club/clients" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Клиенты
                  </NavLink>
                  <NavLink to="/club/statistics" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Статистика
                  </NavLink>
                  <NavLink to="/club/sales" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Продажи
                  </NavLink>
                  <NavLink to="/club/settings" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Настройки
                  </NavLink>
                </>
              ) : isSalesManager ? (
                <>
                  <NavLink to="/sales" end className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Главная
                  </NavLink>
                  <NavLink to="/sales?tab=report" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Отчёт
                  </NavLink>
                  <NavLink to="/sales?tab=stats" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Статистика
                  </NavLink>
                  <NavLink to="/sales?tab=analytics" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Аналитика
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/trainer" end className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Главная
                  </NavLink>
                  <NavLink to="/trainer/calendar" className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    <span className="app-header__nav-with-icon">
                      <CalendarDays size={18} aria-hidden />
                      Ежедневник
                    </span>
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
            <HeaderJournalMenuItem
              isAdmin={isAdmin}
              errorCount={persistentErrorCount}
              updatePending={updatePending}
              remark={menuAttention.helpRemark}
              onOpen={() => {
                setMenuOpen(false)
                openErrorJournal()
              }}
            />
            <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={doSignOut}>
              <LogOut size={18} aria-hidden />
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
    {user ? (
      <HeaderProfileSheet
        open={profileOpen}
        onOpen={openProfile}
        onClose={closeProfile}
        name={myName}
        avatar={myAvatar}
        isTrainer={isTrainer}
        settings={
          <HeaderProfileSettings
            sync={{
              ready: supabaseReady,
              busy: syncBusy,
              run: () => void syncNow(),
              label: syncBusy
                ? syncProgress.label
                  ? `${syncProgress.percent}% — ${syncProgress.label}`
                  : `Синхронизация… ${syncProgress.percent}%`
                : syncMenuLabel,
            }}
            items={{
              showPush: supabaseReady,
              showChatSound: supabaseReady && (isDispatchInboxUser || isAdmin),
              showPhoneQr: supabaseReady && isTrainerRole,
              showScheduleReminders: isTrainerRole,
              clubId: String(user?.club_id ?? '').trim(),
            }}
            recover={{ busy: recoverBusy, run: () => void doRecoverApp() }}
          />
        }
      />
    ) : null}
    <AppErrorJournalModal
      open={errorJournalOpen}
      onClose={() => setErrorJournalOpen(false)}
      onCleared={() => showSyncFeedback('Журнал ошибок очищен', 'ok')}
      onCopyFeedback={(msg, tone) => showSyncFeedback(msg, tone ?? 'ok')}
      context={journalContext}
      onSyncNow={() => void syncNow()}
      syncBusy={syncBusy}
      onSignOut={doSignOut}
    />
    {isDispatchInboxUser ? (
      <TrainerInboxPanel
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        clubId={String(user?.club_id ?? '').trim()}
        onPendingChange={setInboxPending}
        showClientsTab={isTrainerRole}
        initialTab={inboxTab}
        clientsUnread={clientsUnread}
        planerkaPending={inboxPending}
      />
    ) : null}
    {iskraMode !== 'closed' ? (
      <Suspense fallback={null}>
        <GeminiAnalyticsPanel
          mode={iskraMode}
          onClose={closeIskra}
          onExpand={expandIskra}
          onMinimize={minimizeIskra}
          clubId={adminClubValue}
          clubName={adminClubName}
          selectedTrainerId={geminiTrainerId}
          selectedTrainerName={geminiTrainerName}
          initialMessage={geminiInitialMessage}
        />
      </Suspense>
    ) : null}
    {syncFeedback?.mode === 'motto' && syncFeedback.card ? (
      <SyncMottoStrip card={syncFeedback.card} tone={syncFeedback.tone || 'ok'} />
    ) : syncFeedback ? (
      <div
        className={`sync-feedback sync-feedback--${syncFeedback.tone}`}
        role="status"
        aria-live="polite"
      >
        {syncFeedback.text}
      </div>
    ) : null}
    </>
  )
}
