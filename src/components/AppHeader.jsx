import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { pullAdminClientsFromCloud } from '../lib/admin/adminClientsListService'
import { pullTrainerWorkspaceFromCloud } from '../lib/trainerPullService'
import { listSyncQueue } from '../lib/localDb'
import { describeFlushQueueResult, flushSyncQueue, getSyncOutboundSummary, isAppOnline } from '../lib/syncService'
import { subscribeNetworkStatus, initWakeNetworkRecovery } from '../lib/networkReachability'
import { isSupabaseConfigured } from '../lib/supabase'
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { AlertTriangle, BarChart3, CircleHelp, LayoutDashboard, LogOut, Menu, RefreshCw, Trophy, User, UserCircle, Building2 } from 'lucide-react'
import {
  listClubsLocal,
  LOCAL_DATA_CHANGED,
  pullClubsFromSupabase,
  resolveClubDisplayName,
  collectTrainerClubIds,
  dispatchLocalDataChanged,
} from '../lib/dataAccess'
import { DEMO_CLUB_ID } from '../lib/seedDemo'
import { HeaderStopwatch } from './HeaderStopwatch'
import {
  computeNeedsUserAttention,
  getPersistentErrorCount,
  getRecentSyncErrors,
  initSyncAttentionFromJournal,
  recordAppError,
  reportSyncOutcome,
  subscribeSyncAttention,
} from '../lib/appErrorJournal'
import { AppErrorJournalModal } from './AppErrorJournalModal'

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
  const { user, signOut, isAdmin, supabaseReady } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? isAppOnline() : true))
  const [menuOpen, setMenuOpen] = useState(false)
  const [geminiOpen, setGeminiOpen] = useState(false)
  const menuRootRef = useRef(null)
  const [adminClubs, setAdminClubs] = useState([])
  /** Название клуба тренера (adminClubs грузится только на /admin). */
  const [trainerClubLabel, setTrainerClubLabel] = useState(null)
  const [pendingSync, setPendingSync] = useState(0)
  const [unsyncedLocal, setUnsyncedLocal] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ percent: 0, label: '' })
  const [syncFeedback, setSyncFeedback] = useState(null)
  const syncFeedbackTimerRef = useRef(null)
  const [errorJournalOpen, setErrorJournalOpen] = useState(false)
  const [needsAttention, setNeedsAttention] = useState(false)
  const [persistentErrorCount, setPersistentErrorCount] = useState(0)
  const pendingSyncRef = useRef(0)

  const refreshSyncOutbound = async () => {
    if (!isSupabaseConfigured()) {
      setPendingSync(0)
      setUnsyncedLocal(0)
      pendingSyncRef.current = 0
      return
    }
    try {
      const s = await getSyncOutboundSummary()
      setPendingSync(s.queue)
      setUnsyncedLocal(s.localOnly)
      pendingSyncRef.current = s.total
    } catch {
      setPendingSync(0)
      setUnsyncedLocal(0)
      pendingSyncRef.current = 0
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

  const refreshAttention = useCallback(() => {
    setPersistentErrorCount(getPersistentErrorCount())
    setNeedsAttention(computeNeedsUserAttention(pendingSyncRef.current))
  }, [])

  useEffect(() => {
    pendingSyncRef.current = pendingSync
    refreshAttention()
  }, [pendingSync, refreshAttention])

  useEffect(() => {
    initSyncAttentionFromJournal()
    return subscribeSyncAttention(refreshAttention)
  }, [refreshAttention])

  useEffect(() => {
    void refreshSyncOutbound()
    let debounce = null
    const onData = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void refreshSyncOutbound()
      }, 900)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => {
      if (debounce) clearTimeout(debounce)
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
    }
  }, [])

  useEffect(() => {
    if (menuOpen) void refreshSyncOutbound()
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

  const openErrorJournal = () => {
    setMenuOpen(false)
    setErrorJournalOpen(true)
  }

  useEffect(
    () => () => {
      if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    },
    [],
  )

  const bumpSyncProgress = (percent, label) => {
    const pct = Math.min(100, Math.max(0, Math.round(percent)))
    const text = String(label ?? '')
    setSyncProgress({ percent: pct, label: text })
    if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current)
    setSyncFeedback({ text: text ? `${pct}% — ${text}` : `${pct}%`, tone: 'ok' })
  }

  const syncNow = async () => {
    if (syncBusy) return
    setMenuOpen(false)
    setSyncBusy(true)
    setSyncFeedback(null)
    bumpSyncProgress(0, 'Старт…')

    const parts = []
    let hadError = false

    try {
      if (!isAppOnline()) {
        recordAppError({ source: 'network', error: 'Нет сети — синхронизация отложена' })
        showSyncFeedback('Нет Wi‑Fi — синхронизация отложена.', 'warn')
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
        return
      }

      const flush = await flushSyncQueue({
        force: true,
        waitUntilDone: true,
        onProgress: ({ done, total }) => {
          const queueShare = total > 0 ? Math.round((done / total) * 72) : 72
          bumpSyncProgress(4 + queueShare, total > 0 ? `Отправка ${done} из ${total}` : 'Отправка очереди…')
        },
      })
      const flushDesc = describeFlushQueueResult(flush)
      if (flushDesc.offline) {
        showSyncFeedback(flushDesc.message, 'warn')
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
        return
      }
      if (flush?.reason === 'pending_items' && (flush?.remaining ?? 0) > 0) {
        const top = getRecentSyncErrors(1)[0]
        if (top?.error) {
          parts.push(`ошибка: ${String(top.error).slice(0, 80)}`)
        }
      }
      if (flushDesc.part) parts.push(flushDesc.part)
      if ((flush.requeued ?? 0) > 0) {
        parts.unshift(`в очередь +${flush.requeued}`)
      }
      if (flushDesc.hadError) hadError = true

      if (flush?.ok) {
        bumpSyncProgress(74, 'Очередь отправлена')
      }

      if (isSupabaseConfigured() && !flushDesc.offline) {
        try {
          const { pullExercisesFromCloud, pullChallengesForClubFromCloud, pullMembershipTypesForClubFromCloud } =
            await import('../lib/pullReferenceData')
          bumpSyncProgress(76, 'Справочник упражнений…')
          // Sync нажимают вручную, и ожидают увидеть свежие правки админа сразу.
          // `exercises-meta` основан на created_at и не ловит правки без новой записи, поэтому тут форсим pull.
          await pullExercisesFromCloud({ force: true })
          parts.push('справочник')

          if (isAdmin) {
            const club = searchParams.get('club')?.trim()
            if (club) {
              bumpSyncProgress(82, 'Клиенты клуба…')
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
              bumpSyncProgress(92, 'Челленджи…')
              const chPull = await pullChallengesForClubFromCloud(club)
              if (!chPull?.ok) {
                hadError = true
                parts.push(`челленджи: ${chPull.error ?? 'ошибка'}`)
              } else {
                let chMsg = `челленджи (${chPull.count ?? 0})`
                if ((chPull.pruned ?? 0) > 0) chMsg += `, убрано ${chPull.pruned}`
                parts.push(chMsg)
              }
              bumpSyncProgress(94, 'Типы абонементов…')
              const mtPull = await pullMembershipTypesForClubFromCloud(club)
              if (!mtPull?.ok) {
                hadError = true
                parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
              } else {
                parts.push(`типы абон. (${mtPull.count ?? 0})`)
              }
            } else {
              parts.push('клиенты: выберите клуб')
            }
          } else if (user?.id) {
            bumpSyncProgress(84, 'Клиенты и тренировки…')
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
            let chTotal = 0
            let chPruned = 0
            let chFailed = false
            const clubList = [...clubIds]
            for (let ci = 0; ci < clubList.length; ci++) {
              const cid = clubList[ci]
              if (clubList.length > 1) {
                bumpSyncProgress(90 + Math.round(((ci + 1) / clubList.length) * 8), 'Челленджи…')
              } else {
                bumpSyncProgress(94, 'Челленджи…')
              }
              const chPull = await pullChallengesForClubFromCloud(cid)
              if (!chPull?.ok) {
                chFailed = true
                hadError = true
                parts.push(`челленджи: ${chPull.error ?? 'ошибка'}`)
                break
              }
              chTotal += chPull.count ?? 0
              chPruned += chPull.pruned ?? 0
              const mtPull = await pullMembershipTypesForClubFromCloud(cid)
              if (!mtPull?.ok) {
                chFailed = true
                hadError = true
                parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
                break
              }
            }
            if (!chFailed) {
              let chMsg = `челленджи (${chTotal})`
              if (chPruned > 0) chMsg += `, убрано ${chPruned}`
              parts.push(chMsg)
            }
          }
        } catch (e) {
          hadError = true
          console.warn('[sync] pull', e)
          recordAppError({ source: 'pull', error: e?.message ?? 'Ошибка загрузки данных' })
          parts.push('ошибка загрузки')
        }
      }

      const { pruneRedundantSyncQueue } = await import('../lib/syncQueueOrphans')
      await pruneRedundantSyncQueue()
      await refreshSyncOutbound()
      const queueLeft = (await listSyncQueue()).length
      dispatchLocalDataChanged({ reason: 'sync-complete' })

      if (queueLeft > 0) {
        hadError = true
        const top = getRecentSyncErrors(1)[0]
        recordAppError({
          source: 'sync',
          error: top?.error ?? `В очереди осталось ${queueLeft} записей`,
          context: top?.context,
          status: top?.status,
        })
        bumpSyncProgress(98, `В очереди: ${queueLeft}`)
        showSyncFeedback(
          `Не всё ушло в облако: в очереди ${queueLeft} ${queueLeft === 1 ? 'запись' : 'записей'}. Данные на устройстве сохранены — проверьте сеть и нажмите Sync снова.`,
          'warn',
        )
      } else if (hadError) {
        bumpSyncProgress(100, 'Готово с замечаниями')
        showSyncFeedback(`Синхронизация с замечаниями: ${parts.join(' · ')}.`, 'warn')
      } else {
        bumpSyncProgress(100, 'Готово')
        showSyncFeedback(parts.length ? `Готово: ${parts.join(' · ')}.` : 'Синхронизация завершена.', 'ok')
      }

      reportSyncOutcome({ queueCount: queueLeft, hadError })
    } catch (e) {
      console.warn('[sync]', e)
      recordAppError({ source: 'sync', error: e?.message ?? 'Ошибка синхронизации' })
      showSyncFeedback(e?.message ?? 'Ошибка синхронизации', 'err')
      try {
        const q = await listSyncQueue()
        reportSyncOutcome({ queueCount: q.length, hadError: true })
      } catch {
        reportSyncOutcome({ queueCount: pendingSyncRef.current, hadError: true })
      }
    } finally {
      setSyncBusy(false)
      window.setTimeout(() => setSyncProgress({ percent: 0, label: '' }), 800)
    }
  }

  const doSignOut = () => {
    setMenuOpen(false)
    signOut()
  }

  const homeTo = isAdmin ? `/admin${adminQs}` : '/trainer'

  const journalContext = useMemo(() => {
    const clubId = isAdmin ? adminClubValue : String(user?.club_id ?? '').trim()
    const club = adminClubs.find((c) => String(c.id) === clubId)
    return {
      user,
      role: isAdmin ? 'admin' : 'trainer',
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

  const showHeaderSync = supabaseReady
  const syncOutboundTotal = pendingSync + unsyncedLocal
  const syncHasPending = syncOutboundTotal > 0
  const syncBtnClass = [
    'btn',
    'btn-ghost',
    'app-header__action',
    'app-header__sync-btn',
    syncBusy ? 'app-header__sync-btn--busy' : syncHasPending ? 'app-header__sync-btn--pending' : 'app-header__sync-btn--idle',
  ].join(' ')
  const syncBtnTitle = syncBusy
    ? syncProgress.label
      ? `${syncProgress.percent}% — ${syncProgress.label}`
      : `Синхронизация… ${syncProgress.percent}%`
    : syncHasPending
      ? unsyncedLocal > 0 && pendingSync === 0
        ? `Только на устройстве: ${unsyncedLocal} — отправить в облако`
        : unsyncedLocal > 0
          ? `Очередь ${pendingSync}, ещё ${unsyncedLocal} только на устройстве`
          : `Отправить в облако (${pendingSync} в очереди)`
      : 'Синхронизировать с облаком'

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
            title={adminClubValue ? 'Спросить аналитика по клубу' : 'Сначала выберите клуб'}
            aria-label={adminClubValue ? 'Спросить аналитика по клубу' : 'Сначала выберите клуб'}
            onClick={() => setGeminiOpen(true)}
          >
            <span aria-hidden>✨</span>
          </button>
        ) : null}
        {!isAdmin && user ? <HeaderStopwatch /> : null}
        {showHeaderSync ? (
          <div className="app-header__sync-wrap">
            <button
              type="button"
              className={syncBtnClass}
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
                <span className="app-header__sync-badge" aria-hidden>
                  {syncOutboundTotal > 99 ? '99+' : syncOutboundTotal}
                </span>
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
                  : syncHasPending
                    ? `Синхронизировать (${syncOutboundTotal})`
                    : 'Синхронизировать'}
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
          onClose={() => setGeminiOpen(false)}
          clubId={adminClubValue}
          clubName={adminClubName}
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
