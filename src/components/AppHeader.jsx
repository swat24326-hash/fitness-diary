import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { subscribeNetworkStatus, initWakeNetworkRecovery } from '../lib/networkReachability'
import { isAppOnline } from '../lib/syncService'
import { isSupabaseConfigured } from '../lib/supabase'
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { AlertTriangle, BarChart3, CircleHelp, LayoutDashboard, LogOut, Menu, RefreshCw, Trophy, TrendingUp, User, UserCircle, Building2 } from 'lucide-react'
import {
  listClubsLocal,
  LOCAL_DATA_CHANGED,
  pullClubsFromSupabase,
  resolveClubDisplayName,
} from '../lib/dataAccess'
import { DEMO_CLUB_ID } from '../lib/seedDemo'
import { HeaderStopwatch } from './HeaderStopwatch'
import { AppErrorJournalModal } from './AppErrorJournalModal'
import { useIskraPanel } from '../context/IskraPanelContext.jsx'
import { useHeaderSync } from './useHeaderSync'

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
  const { user, signOut, isAdmin, isSalesManager, supabaseReady } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? isAppOnline() : true))
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const { open: geminiOpen, trainerId: geminiTrainerId, trainerName: geminiTrainerName, initialMessage: geminiInitialMessage, openIskra, closeIskra } = useIskraPanel()
  const menuRootRef = useRef(null)
  const [adminClubs, setAdminClubs] = useState([])
  /** Название клуба тренера (adminClubs грузится только на /admin). */
  const [trainerClubLabel, setTrainerClubLabel] = useState(null)

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
  } = useHeaderSync({ user, isAdmin, isSalesManager, supabaseReady, searchParams, menuOpen, closeMenu })

  const showAdminClubSelect = isAdmin && location.pathname.startsWith('/admin')
  const adminClubValue = searchParams.get('club') ?? ''
  const adminQs = useMemo(() => (adminClubValue ? `?club=${encodeURIComponent(adminClubValue)}` : ''), [adminClubValue])
  const salesReportActive = searchParams.get('tab') === 'report'
  const salesStatsActive = searchParams.get('tab') === 'stats'
  const salesAnalyticsActive = searchParams.get('tab') === 'analytics'
  const salesHomeActive =
    location.pathname === '/sales' && !salesReportActive && !salesStatsActive && !salesAnalyticsActive

  useEffect(() => {
    if (!showAdminClubSelect) return
    let alive = true
    const load = async () => {
      try {
        let rows = await listClubsLocal()
        if (supabaseReady && rows.length > 1) {
          rows = rows.filter((c) => String(c.id) !== DEMO_CLUB_ID)
        }
        if (alive && rows.length) setAdminClubs(Array.isArray(rows) ? rows : [])

        if (supabaseReady) {
          await pullClubsFromSupabase()
          rows = await listClubsLocal()
          if (supabaseReady && rows.length > 1) {
            rows = rows.filter((c) => String(c.id) !== DEMO_CLUB_ID)
          }
        }
        if (alive) setAdminClubs(Array.isArray(rows) ? rows : [])
      } catch {
        if (alive) setAdminClubs([])
      }
    }
    void load()
    let clubDebounce = null
    const onData = (e) => {
      if (e?.detail?.reason === 'club-deleted') {
        void listClubsLocal().then((rows) => {
          if (!alive) return
          const filtered =
            supabaseReady && rows.length > 1 ? rows.filter((c) => String(c.id) !== DEMO_CLUB_ID) : rows
          setAdminClubs(Array.isArray(filtered) ? filtered : [])
        })
        return
      }
      if (clubDebounce) clearTimeout(clubDebounce)
      clubDebounce = setTimeout(() => {
        clubDebounce = null
        void load()
      }, 300)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => {
      alive = false
      if (clubDebounce) clearTimeout(clubDebounce)
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
    }
  }, [showAdminClubSelect, supabaseReady])

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

  /** Один зал — сразу в URL; несколько — без «все клубы», только явный выбор. */
  useEffect(() => {
    if (!showAdminClubSelect || adminClubs.length === 0) return

    const current = searchParams.get('club')?.trim() ?? ''
    const validIds = new Set(adminClubs.map((c) => String(c.id)))
    let nextClub = current

    if (adminClubs.length === 1) {
      nextClub = String(adminClubs[0].id)
    } else if (current && !validIds.has(current)) {
      nextClub = ''
    }

    if (nextClub === current) return

    const next = new URLSearchParams(searchParams)
    if (nextClub) next.set('club', nextClub)
    else next.delete('club')
    setSearchParams(next, { replace: true })
  }, [showAdminClubSelect, adminClubs, searchParams, setSearchParams])

  useEffect(() => subscribeNetworkStatus(setOnline), [])
  useEffect(() => initWakeNetworkRecovery(), [])

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

  const homeTo = isAdmin ? `/admin${adminQs}` : isSalesManager ? '/sales' : '/trainer'

  const journalContext = useMemo(() => {
    const clubId = isAdmin ? adminClubValue : String(user?.club_id ?? '').trim()
    const club = adminClubs.find((c) => String(c.id) === clubId)
    return {
      user,
      role: isAdmin ? 'admin' : isSalesManager ? 'sales_manager' : 'trainer',
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
    online,
    supabaseReady,
    adminClubValue,
    adminClubs,
    trainerClubLabel,
    location.pathname,
    location.search,
  ])

  const onAdminClubChange = (e) => {
    const v = e.target.value
    const next = new URLSearchParams(searchParams)
    if (v) next.set('club', v)
    else next.delete('club')
    setSearchParams(next, { replace: true })
  }

  const adminClubName = useMemo(() => {
    const club = adminClubs.find((c) => String(c.id) === String(adminClubValue))
    return club?.name?.trim() || ''
  }, [adminClubs, adminClubValue])

  return (
    <>
    <header
      className={[
        'app-header',
        isAdmin ? 'app-header--admin' : 'app-header--trainer',
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
            <NavLink to={`/admin/challenges${adminQs}`} className={headerNavClass}>
              <span className="app-header__nav-with-icon">
                <Trophy size={18} aria-hidden />
                Челленджи
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
          <select
            className="app-header__club-select"
            value={adminClubValue}
            onChange={onAdminClubChange}
            aria-label="Клуб"
            title="Клуб"
          >
            {adminClubs.length !== 1 ? (
              <option value="" disabled={!!adminClubValue}>
                Выберите клуб…
              </option>
            ) : null}
            {adminClubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        {showAdminClubSelect ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm app-header__vasya-btn"
            disabled={!adminClubValue}
            title={adminClubValue ? 'ЭВС «ИСКРА» — аналитика клуба' : 'Сначала выберите клуб'}
            aria-label={adminClubValue ? 'ЭВС «ИСКРА» — аналитика клуба' : 'Сначала выберите клуб'}
            onClick={() => openIskra({})}
          >
            <span aria-hidden>✨</span>
          </button>
        ) : null}
        {!isAdmin && !isSalesManager && user ? <HeaderStopwatch /> : null}
        {showHeaderSync ? (
          <div className="app-header__sync-wrap">
            <button
              type="button"
              className={`${syncBtnClass}${syncHasPending && !syncBusy ? ' app-header__sync-btn--labeled' : ''}`}
              disabled={syncBusy}
              onClick={() => void syncNow()}
              title={syncBtnTitle}
              aria-label={syncBtnTitle}
              aria-busy={syncBusy}
            >
              <RefreshCw size={20} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
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
        <button
          type="button"
          className={[
            'btn',
            'btn-ghost',
            'app-header__action',
            'app-header__burger',
            needsAttention && !menuOpen ? 'app-header__burger--has-errors' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-controls="app-header-account-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Menu size={22} aria-hidden />
          {needsAttention && !menuOpen ? (
            <span className="app-header__error-dot" aria-hidden title="Требует внимания: очередь sync или ошибка" />
          ) : null}
          <span className="sr-only">Меню аккаунта</span>
        </button>
        </div>
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
                  <NavLink to={`/admin/statistics${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Статистика
                  </NavLink>
                  <NavLink to={`/admin/challenges${adminQs}`} className={menuNavClass} onClick={() => setMenuOpen(false)}>
                    Челленджи
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
                  {!isAdmin && !online && ' · офлайн'}
                </span>
              </div>
            </div>
            {supabaseReady ? (
              <button
                type="button"
                className="app-header__menu-item"
                disabled={syncBusy}
                onClick={() => void syncNow()}
              >
                <RefreshCw size={18} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
                {syncBusy
                  ? syncProgress.label
                    ? `${syncProgress.percent}% — ${syncProgress.label}`
                    : `Синхронизация… ${syncProgress.percent}%`
                  : syncMenuLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="app-header__menu-item app-header__menu-item--journal"
              onClick={openErrorJournal}
            >
              <span className="app-header__menu-item-main">
                {isAdmin ? (
                  <AlertTriangle size={18} aria-hidden />
                ) : (
                  <CircleHelp size={18} aria-hidden />
                )}
                {isAdmin ? 'Журнал ошибок' : 'Помощь'}
              </span>
              {persistentErrorCount > 0 ? (
                <span className="app-header__error-badge" aria-label={`Записей в журнале: ${persistentErrorCount}`}>
                  {persistentErrorCount > 99 ? '99+' : persistentErrorCount}
                </span>
              ) : null}
            </button>
            <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={doSignOut}>
              <LogOut size={18} aria-hidden />
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
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
    {geminiOpen ? (
      <Suspense fallback={null}>
        <GeminiAnalyticsPanel
          open={geminiOpen}
          onClose={closeIskra}
          clubId={adminClubValue}
          clubName={adminClubName}
          selectedTrainerId={geminiTrainerId}
          selectedTrainerName={geminiTrainerName}
          initialMessage={geminiInitialMessage}
        />
      </Suspense>
    ) : null}
    {syncFeedback && (
      <div
        className={`sync-feedback sync-feedback--${syncFeedback.tone}`}
        role="status"
        aria-live="polite"
      >
        {syncFeedback.text}
      </div>
    )}
    </>
  )
}
