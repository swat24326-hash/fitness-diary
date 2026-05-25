import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { pullAdminClientsFromCloud } from '../lib/admin/adminClientsListService'
import { pullTrainerWorkspaceFromCloud } from '../lib/trainerPullService'
import { listSyncQueue } from '../lib/localDb'
import { flushSyncQueue, isAppOnline } from '../lib/syncService'
import { subscribeNetworkStatus } from '../lib/networkReachability'
import { isSupabaseConfigured } from '../lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, LogOut, Menu, RefreshCw, Trophy, User, UserCircle, BookOpen, Building2 } from 'lucide-react'
import {
  listClubsLocal,
  LOCAL_DATA_CHANGED,
  pullClubsFromSupabase,
  collectTrainerClubIds,
  dispatchLocalDataChanged,
} from '../lib/dataAccess'
import { DEMO_CLUB_ID } from '../lib/seedDemo'

function headerNavClass({ isActive }) {
  return `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
}

function menuNavClass({ isActive }) {
  return `app-header__menu-link${isActive ? ' app-header__menu-link--active' : ''}`
}

export function AppHeader() {
  const { user, signOut, isAdmin, supabaseReady } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? isAppOnline() : true))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRootRef = useRef(null)
  const [adminClubs, setAdminClubs] = useState([])
  const [pendingSync, setPendingSync] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState(null)
  const syncFeedbackTimerRef = useRef(null)

  const refreshPendingSync = async () => {
    if (!isSupabaseConfigured()) {
      setPendingSync(0)
      return
    }
    try {
      const q = await listSyncQueue()
      setPendingSync(q.length)
    } catch {
      setPendingSync(0)
    }
  }

  const showAdminClubSelect = isAdmin && location.pathname.startsWith('/admin')
  const adminClubValue = searchParams.get('club') ?? ''
  const adminQs = useMemo(() => (adminClubValue ? `?club=${encodeURIComponent(adminClubValue)}` : ''), [adminClubValue])

  useEffect(() => {
    if (!showAdminClubSelect) return
    let alive = true
    const load = async () => {
      try {
        if (supabaseReady) {
          await pullClubsFromSupabase()
        }
        let rows = await listClubsLocal()
        if (supabaseReady && rows.length > 1) {
          rows = rows.filter((c) => String(c.id) !== DEMO_CLUB_ID)
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

  useEffect(() => {
    void refreshPendingSync()
    const onData = () => void refreshPendingSync()
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onData)
  }, [])

  useEffect(() => {
    if (menuOpen) void refreshPendingSync()
  }, [menuOpen])

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

  const showSyncFeedback = (text, tone = 'ok') => {
    if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    setSyncFeedback({ text, tone })
    syncFeedbackTimerRef.current = setTimeout(() => {
      setSyncFeedback(null)
      syncFeedbackTimerRef.current = null
    }, 6000)
  }

  useEffect(
    () => () => {
      if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    },
    [],
  )

  const syncNow = async () => {
    if (syncBusy) return
    setMenuOpen(false)
    setSyncBusy(true)
    setSyncFeedback(null)

    const parts = []
    let hadError = false

    try {
      if (!isAppOnline()) {
        showSyncFeedback('Нет сети — синхронизация отложена.', 'warn')
        return
      }

      const flush = await flushSyncQueue({ force: true })
      if (flush?.ok) parts.push('очередь отправлена')
      else if (flush?.reason === 'offline_or_stub') {
        showSyncFeedback('Облако недоступно или вы офлайн.', 'warn')
        return
      } else if (flush?.reason === 'timeout') {
        parts.push('очередь: таймаут')
        hadError = true
      }

      if (isSupabaseConfigured()) {
        try {
          const { pullExercisesFromCloud, pullChallengesForClubFromCloud } = await import('../lib/pullReferenceData')
          await pullExercisesFromCloud({ force: false })
          parts.push('справочник')

          if (isAdmin) {
            const club = searchParams.get('club')?.trim()
            if (club) {
              const { listChallengesLocalForClub, pushChallengeToCloud } = await import('../lib/challengeService')
              for (const ch of await listChallengesLocalForClub(club)) {
                await pushChallengeToCloud(ch)
              }
              const pull = await pullAdminClientsFromCloud(club)
              if (pull?.ok) {
                let msg = `клиенты (${pull.count ?? 0})`
                if ((pull.pruned_clients ?? 0) > 0 || (pull.pruned_trainings ?? 0) > 0) {
                  msg += `, очищено кэша: ${pull.pruned_clients ?? 0} кл. / ${pull.pruned_trainings ?? 0} черн.`
                }
                parts.push(msg)
              }
              await pullChallengesForClubFromCloud(club)
              parts.push('челленджи')
            } else {
              parts.push('клиенты: выберите клуб')
            }
          } else if (user?.id) {
            const pull = await pullTrainerWorkspaceFromCloud(user.id)
            if (pull?.ok) {
              let msg = `рабочая область (${pull.count ?? 0} кл.)`
              if ((pull.pruned_clients ?? 0) > 0) msg += `, убрано из кэша: ${pull.pruned_clients}`
              parts.push(msg)
            } else if (pull?.error) {
              hadError = true
              parts.push(`тренер: ${pull.error}`)
            }
            const clubIds = await collectTrainerClubIds(user.id, user?.club_id)
            for (const cid of clubIds) {
              await pullChallengesForClubFromCloud(cid)
            }
            parts.push('челленджи')
          }
        } catch (e) {
          hadError = true
          console.warn('[sync] pull', e)
          parts.push('ошибка загрузки')
        }
      }

      await refreshPendingSync()
      dispatchLocalDataChanged({ reason: 'sync-complete' })

      if (hadError) {
        showSyncFeedback(`Синхронизация с замечаниями: ${parts.join(' · ')}.`, 'warn')
      } else {
        showSyncFeedback(parts.length ? `Готово: ${parts.join(' · ')}.` : 'Синхронизация завершена.', 'ok')
      }
    } catch (e) {
      console.warn('[sync]', e)
      showSyncFeedback(e?.message ?? 'Ошибка синхронизации', 'err')
    } finally {
      setSyncBusy(false)
    }
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

  const showTrainerHeaderSync = !isAdmin && supabaseReady
  const syncHasPending = pendingSync > 0
  const syncBtnClass = [
    'btn',
    'btn-ghost',
    'app-header__action',
    'app-header__sync-btn',
    syncBusy ? 'app-header__sync-btn--busy' : syncHasPending ? 'app-header__sync-btn--pending' : 'app-header__sync-btn--idle',
  ].join(' ')
  const syncBtnTitle = syncBusy
    ? 'Синхронизация…'
    : syncHasPending
      ? `Отправить в облако (${pendingSync} в очереди)`
      : 'Синхронизировать с облаком'

  return (
    <>
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
        {showTrainerHeaderSync ? (
          <button
            type="button"
            className={syncBtnClass}
            disabled={syncBusy}
            onClick={() => void syncNow()}
            title={syncBtnTitle}
            aria-label={syncBtnTitle}
          >
            <RefreshCw size={20} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
            {syncHasPending && !syncBusy ? (
              <span className="app-header__sync-badge" aria-hidden>
                {pendingSync > 99 ? '99+' : pendingSync}
              </span>
            ) : null}
          </button>
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
                  {!isAdmin && !online && ' · офлайн'}
                </span>
              </div>
            </div>
            {isAdmin ? (
              <button
                type="button"
                className="app-header__menu-item"
                disabled={syncBusy}
                onClick={() => void syncNow()}
              >
                <RefreshCw size={18} className={syncBusy ? 'icon-spin' : undefined} aria-hidden />
                {syncBusy ? 'Синхронизация…' : 'Синхронизировать'}
              </button>
            ) : null}
            <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={doSignOut}>
              <LogOut size={18} aria-hidden />
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
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
