import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Archive, RefreshCw, RotateCcw, Search, Trash2, UserCircle, UserCog, UserSearch } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminClientClubSmsButton } from '../../components/admin/AdminClientClubSmsButton.jsx'
import { AdminClientsBrowseFilters } from '../../components/admin/AdminClientsBrowseFilters.jsx'
import { ClientRowMoreMenu } from '../../components/ClientRowMoreMenu.jsx'
import {
  deleteClientAndAllData,
  dispatchLocalDataChanged,
  getLocalClient,
  listAdminClientsForClub,
  listTrainerSummariesForAdmin,
} from '../../lib/dataAccess'
import { isAdminClientQuickFilter, normalizeAdminClientQuickFilter } from '../../lib/admin/adminClientQuickFilters'
import { buildAdminClientsTodaySnapshot, shouldShowAdminClientsList } from '../../lib/admin/adminClientsBrowseCore'
import {
  clientMatchesAdminFunnelFilter,
  countAdminFunnelFilters,
} from '../../lib/admin/adminClientsFunnelCore.js'
import { loadAdminClubMembershipsMap, loadAdminClubTrainingsForClientIds } from '../../lib/admin/adminClubWorkspaceCache'
import { fetchClientsLastTrainingsViaApi } from '../../lib/admin/adminApiClient'
import { fetchClubSmsStatus } from '../../lib/admin/clubSmsService.js'
import { listRecentClubSmsLogs } from '../../lib/admin/clubSmsLogService.js'
import {
  clubSmsMarkChipLabel,
  clubSmsMarkTitle,
  mapClubSmsMarksByClient,
  resolveClientClubSmsScenario,
} from '../../lib/admin/clubSmsSentMarkCore.js'
import { resolveClubSmsMode } from '../../lib/admin/clubSmsModeCore.js'
import { pullAdminClientsFromCloud } from '../../lib/admin/adminClientsListService'
import { useDebouncedStorageReload, shouldReloadAdminClientsPage } from '../../lib/useDebouncedStorageReload'
import { ADMIN_CLIENTS_PAGE_SIZE, ADMIN_CLIENTS_REMOTE_LIMIT } from '../../lib/admin/adminConstants'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { USERS_TRAINER_ROLES } from '../../lib/userRoleConstants'
import { saveLocalWithSync } from '../../lib/syncService'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { countedUsedTrainingsOnMembership, formatInactiveClientListLabel, membershipHasRemaining, membershipUsageLabel, pickUsableMembershipForDate } from '../../lib/membershipRules'
import '../../styles/pnk-funnel.css'

function pickExpiredMembershipWithRemaining(list, todayIso) {
  const d = String(todayIso ?? '')
  const candidates = (list ?? []).filter((m) => String(m?.end_date ?? '') < d && membershipHasRemaining(m))
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

function membershipSignal(list, today) {
  const active = pickUsableMembershipForDate(list ?? [], today)
  if (!active) {
    const expiredLeft = pickExpiredMembershipWithRemaining(list, today)
    if (expiredLeft) {
      const total = Number(expiredLeft.total_trainings ?? 0)
      const used = Number(expiredLeft.used_trainings ?? 0)
      const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
      return { key: 'expired_remaining', color: '#f59e0b', label: `срок истёк, осталось ${remaining ?? '—'}` }
    }
    return { key: 'none', color: '#f87171', label: 'нет активного' }
  }

  const total = Number(active.total_trainings ?? 0)
  const used = Number(active.used_trainings ?? 0)
  const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
  if (remaining === 0) return { key: 'limit0', color: '#f87171', label: 'лимит 0' }

  const end = new Date(active.end_date)
  const d0 = new Date(today)
  const days = Math.ceil((end - d0) / 86400000)
  if (days <= 3) return { key: 'expiring', color: '#eab308', label: `≤${days}д` }
  return { key: 'active', color: '#22c55e', label: 'активен' }
}

function lastTrainingDateFromMap(map, clientId) {
  const d = map?.[String(clientId ?? '')]
  return d ? formatDateRu(d) : '—'
}

function buildLastTrainingMap(trainings) {
  const out = {}
  for (const t of trainings ?? []) {
    const cid = String(t?.client_id ?? '')
    if (!cid) continue
    const d = String(t.date ?? t.created_at?.slice(0, 10) ?? '')
    if (!d) continue
    if (!out[cid] || d > out[cid]) out[cid] = d
  }
  return out
}

/** Остаток занятий: дневник + поле абонемента (если кэш тренировок пуст на устройстве админа). */
function remainingTrainingsOnMembership(membership, clientTrainings) {
  if (!membership) return null
  const total = Number(membership.total_trainings ?? 0)
  if (!Number.isFinite(total)) return null
  const usedDiary = countedUsedTrainingsOnMembership(membership, clientTrainings)
  const usedStored = Number(membership.used_trainings ?? 0)
  const used = Math.max(usedDiary, Number.isFinite(usedStored) ? usedStored : 0)
  return Math.max(0, total - used)
}

export function AdminClients() {
  const ctx = useOutletContext()
  const clubIdCtx = ctx?.clubId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const club = searchParams.get('club') ?? clubIdCtx ?? ''
  const filterFromUrl = searchParams.get('filter')

  const [clients, setClients] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [lastTrainingByClient, setLastTrainingByClient] = useState({})
  const [pageTrainings, setPageTrainings] = useState([])
  const [trainerNameById, setTrainerNameById] = useState({})
  const [busy, setBusy] = useState(false)
  const [listPage, setListPage] = useState(0)
  const [pageTrainingsBusy, setPageTrainingsBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [trainerQuery, setTrainerQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState(() => {
    const n = normalizeAdminClientQuickFilter(filterFromUrl)
    return isAdminClientQuickFilter(n) ? n : 'none'
  })
  const [clientsTab, setClientsTab] = useState('active') // active | archive
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [source, setSource] = useState('local')
  const [fallback, setFallback] = useState(null)
  const [cloudNeedsClub, setCloudNeedsClub] = useState(false)
  const [listTruncated, setListTruncated] = useState(false)

  const [reassignClient, setReassignClient] = useState(null)
  const [trainerOptions, setTrainerOptions] = useState([])
  const [reassignTrainerId, setReassignTrainerId] = useState('')
  const [reassignManualUuid, setReassignManualUuid] = useState('')
  const [reassignLoadErr, setReassignLoadErr] = useState('')
  const [reassignBusy, setReassignBusy] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [smsFeedback, setSmsFeedback] = useState(null)
  const [clubSmsConfigured, setClubSmsConfigured] = useState(null)
  const [clubSmsTemplates, setClubSmsTemplates] = useState(null)
  const [clubSmsClubName, setClubSmsClubName] = useState('')
  /** @type {[object[], function]} */
  const [clubSmsLogs, setClubSmsLogs] = useState([])

  useEffect(() => {
    let cancelled = false
    if (!club) {
      setClubSmsConfigured(false)
      setClubSmsTemplates(null)
      setClubSmsClubName('')
      setClubSmsLogs([])
      return undefined
    }
    fetchClubSmsStatus(club)
      .then((r) => {
        if (cancelled) return
        setClubSmsConfigured(r.configured)
        setClubSmsTemplates(r.templates ?? null)
        setClubSmsClubName(r.clubName || '')
      })
      .catch(() => {
        if (!cancelled) {
          setClubSmsConfigured(false)
          setClubSmsTemplates(null)
          setClubSmsClubName('')
        }
      })
    void listRecentClubSmsLogs(club, { todayIso: todayLocalIso() }).then((rows) => {
      if (!cancelled) setClubSmsLogs(rows)
    })
    return () => {
      cancelled = true
    }
  }, [club])

  const onSmsFeedback = useCallback((msg, tone = 'ok') => {
    setSmsFeedback({ msg, tone })
    window.setTimeout(() => setSmsFeedback(null), 4000)
  }, [])

  const onClubSmsSent = useCallback((clientId, scenario = 'custom') => {
    const id = String(clientId ?? '').trim()
    if (!id || !club) return
    const entry = {
      id: `local_${Date.now()}`,
      client_id: id,
      club_id: club,
      scenario: String(scenario || 'custom'),
      channel: 'club_sms',
      created_at: new Date().toISOString(),
    }
    setClubSmsLogs((prev) => [...prev, entry])
  }, [club])

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBusy(true)
    try {
      const [{ clients: list, source: src, fallbackReason, cloudNeedsClub: need, truncated: trunc }, trainers] = await Promise.all([
        listAdminClientsForClub({ clubId: club || '' }),
        listTrainerSummariesForAdmin(),
      ])
      setListTruncated(!!trunc)
      setCloudNeedsClub(!!need)
      setSource(src)
      setFallback(fallbackReason ?? null)

      const nm = {}
      for (const u of trainers) {
        nm[u.id] = u.name?.trim() || '—'
      }
      setTrainerNameById(nm)

      const arr = Array.isArray(list) ? list : []
      setClients(arr)
      setLastTrainingByClient({})
      setPageTrainings([])

      const map = club ? await loadAdminClubMembershipsMap(club) : {}
      setMemByClient(map)
    } catch {
      setClients([])
      setMemByClient({})
      setLastTrainingByClient({})
      setPageTrainings([])
      setTrainerNameById({})
      setSource('local')
      setFallback(null)
      setCloudNeedsClub(false)
      setListTruncated(false)
    } finally {
      if (!silent) setBusy(false)
    }
  }, [club])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadAdminClientsPage })

  useEffect(() => {
    const raw = searchParams.get('filter')
    const n = normalizeAdminClientQuickFilter(raw)
    if (raw === 'expired_remaining' || raw === 'active_today') {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (n === 'none') p.delete('filter')
          else p.set('filter', n)
          return p
        },
        { replace: true },
      )
    }
    if (isAdminClientQuickFilter(n)) setQuickFilter(n)
    else if (!raw) setQuickFilter('none')
  }, [searchParams, setSearchParams])

  // Доп. pull архива при вкладке (основной снимок уже в active+archive merge при загрузке).
  useEffect(() => {
    if (clientsTab !== 'archive') return
    if (!club?.trim()) return
    if (!isSupabaseConfigured() || !navigator.onLine) return
    let cancelled = false
    setArchiveBusy(true)
    void (async () => {
      try {
        await pullAdminClientsFromCloud(club, { mode: 'archive' })
        if (!cancelled) await reload({ silent: true })
      } finally {
        if (!cancelled) setArchiveBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientsTab, club, reload])

  const refreshFromCloud = useCallback(async () => {
    if (!club?.trim()) {
      setRefreshMsg('Выберите клуб в панели сверху.')
      return
    }
    setBusy(true)
    setRefreshMsg('')
    try {
      if (isSupabaseConfigured() && navigator.onLine) {
        const r = await pullAdminClientsFromCloud(club)
        if (r.ok) {
          const extra =
            (r.pruned_clients ?? 0) > 0 || (r.pruned_trainings ?? 0) > 0
              ? ` Очищено из кэша: клиентов ${r.pruned_clients ?? 0}, черновиков ${r.pruned_trainings ?? 0}.`
              : ''
          setRefreshMsg(`Список обновлён из облака (${r.count ?? 0} клиентов).${extra}`)
        } else if (r.reason === 'no_club') {
          setRefreshMsg('Выберите клуб.')
        } else {
          setRefreshMsg('Не удалось загрузить с сервера — показан локальный кэш.')
        }
      }
      await reload({ silent: true })
    } catch (e) {
      setRefreshMsg(e?.message ?? 'Ошибка обновления')
      await reload({ silent: true })
    } finally {
      setBusy(false)
    }
  }, [club, reload])

  const today = todayLocalIso()

  const allMemberships = useMemo(() => {
    const out = []
    for (const list of Object.values(memByClient)) out.push(...(list ?? []))
    return out
  }, [memByClient])

  const todaySnapshot = useMemo(
    () => buildAdminClientsTodaySnapshot(clients, allMemberships, today),
    [clients, allMemberships, today],
  )

  const showClientList = useMemo(
    () =>
      shouldShowAdminClientsList({
        query,
        trainerQuery,
        browseMode: quickFilter,
        clientsTab,
      }),
    [query, trainerQuery, quickFilter, clientsTab],
  )

  const operationalClients = useMemo(() => clients.filter((c) => !c?.archived_at), [clients])
  const archivedCount = useMemo(() => clients.filter((c) => Boolean(c?.archived_at)).length, [clients])

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const tq = trainerQuery.trim().toLowerCase()

    const tabBase = clientsTab === 'archive' ? clients.filter((c) => Boolean(c?.archived_at)) : clients.filter((c) => !c?.archived_at)
    let base = tabBase
    if (q) {
      base = base.filter((c) => {
        const name = String(c.name ?? '').toLowerCase()
        const phone = String(c.phone ?? '').toLowerCase()
        const card = String(c.card_number ?? '').toLowerCase()
        return name.includes(q) || phone.includes(q) || card.includes(q)
      })
    }
    if (tq) {
      base = base.filter((c) => {
        const trainerName = String(trainerNameById[c.trainer_id] ?? '').toLowerCase()
        return trainerName && trainerName.includes(tq)
      })
    }

    if (quickFilter === 'none') return base
    if (quickFilter === 'all') {
      return base.filter((c) => String(c?.lifecycle ?? '') !== 'pnk')
    }
    return base.filter((c) =>
      clientMatchesAdminFunnelFilter(quickFilter, {
        client: c,
        memList: memByClient[c.id] ?? [],
        today,
        inactiveIds: todaySnapshot.inactiveIds,
      }),
    )
  }, [clients, clientsTab, query, trainerQuery, quickFilter, memByClient, today, trainerNameById, todaySnapshot])

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / ADMIN_CLIENTS_PAGE_SIZE))

  useEffect(() => {
    setListPage(0)
  }, [clientsTab, query, trainerQuery, quickFilter, club])

  useEffect(() => {
    if (listPage > totalPages - 1) setListPage(Math.max(0, totalPages - 1))
  }, [listPage, totalPages])

  const pagedClients = useMemo(() => {
    const start = listPage * ADMIN_CLIENTS_PAGE_SIZE
    return filteredClients.slice(start, start + ADMIN_CLIENTS_PAGE_SIZE)
  }, [filteredClients, listPage])

  useEffect(() => {
    const ids = pagedClients.map((c) => c.id).filter(Boolean)
    if (!club?.trim() || !ids.length) {
      setLastTrainingByClient({})
      setPageTrainings([])
      return
    }
    let cancelled = false
    setPageTrainingsBusy(true)
    void (async () => {
      try {
        const rows = await loadAdminClubTrainingsForClientIds(club, ids)
        let map = buildLastTrainingMap(rows)
        const missing = ids.map(String).filter((id) => !map[id] || map[id] === '—')
        if (missing.length && isSupabaseConfigured() && navigator.onLine) {
          try {
            const remote = await fetchClientsLastTrainingsViaApi({ clubId: club, clientIds: missing })
            const remoteMap = remote?.lastByClient ?? {}
            map = { ...map, ...remoteMap }
          } catch {
            /* облако недоступно — оставляем локальный кэш */
          }
        }
        if (!cancelled) {
          setPageTrainings(rows)
          setLastTrainingByClient(map)
        }
      } catch {
        if (!cancelled) {
          setLastTrainingByClient({})
          setPageTrainings([])
        }
      } finally {
        if (!cancelled) setPageTrainingsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [club, pagedClients])

  const filterCounts = useMemo(() => {
    const tabBase = clientsTab === 'archive' ? clients.filter((c) => Boolean(c?.archived_at)) : operationalClients
    const funnel = countAdminFunnelFilters(tabBase, memByClient, today, todaySnapshot.inactiveIds)
    return {
      all: todaySnapshot.totalOperational,
      pnk: funnel.pnk,
      inactive: todaySnapshot.inactiveCount,
      awaiting_start: funnel.awaiting_start,
      birthdays: funnel.birthdays,
      expiring: funnel.expiring,
      expired_recent: funnel.expired_recent,
      stale: funnel.stale,
    }
  }, [clients, clientsTab, memByClient, today, operationalClients, todaySnapshot])

  const browseFilterLabels = {
    all: 'Все клиенты',
    pnk: 'Воронка ПНК',
    inactive: 'Не активные на сегодня',
    awaiting_start: 'Ждёт старт абонемента',
    birthdays: 'ДР сегодня',
    expiring: 'Истекает абонемент',
    expired_recent: 'Абонемент закончился',
    stale: 'Давно не был',
  }

  const activeBrowseLabel = browseFilterLabels[quickFilter] ?? null
  const smsMode = useMemo(() => resolveClubSmsMode(quickFilter), [quickFilter])
  const clientSmsScenarioById = useMemo(() => {
    /** @type {Record<string, string>} */
    const out = {}
    for (const c of clients ?? []) {
      const id = String(c?.id ?? '')
      if (!id) continue
      out[id] = resolveClientClubSmsScenario({
        client: c,
        memList: memByClient[id] ?? memByClient[c.id] ?? [],
        today,
      })
    }
    return out
  }, [clients, memByClient, today])
  const viewingSmsFilter = quickFilter === 'none' ? 'all' : quickFilter
  const clubSmsMarkByClient = useMemo(
    () =>
      mapClubSmsMarksByClient(clubSmsLogs, {
        today,
        viewingFilter: viewingSmsFilter,
        clientScenarioById: clientSmsScenarioById,
      }),
    [clubSmsLogs, today, viewingSmsFilter, clientSmsScenarioById],
  )

  const clearBrowseFilter = () => {
    setQuickFilter('none')
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('filter')
        return p
      },
      { replace: true },
    )
  }

  const switchClientsTab = (tab) => {
    setClientsTab(tab)
    if (tab === 'archive') clearBrowseFilter()
  }

  const applyFilter = (id) => {
    const next = quickFilter === id ? 'none' : id
    setQuickFilter(next)
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'none') p.delete('filter')
        else p.set('filter', next)
        return p
      },
      { replace: true },
    )
  }

  const updateClientArchiveFlag = async (clientRow, archived) => {
    if (!clientRow?.id) return
    if (archived) {
      const ok = window.confirm(`Убрать клиента в архив?\n\n${clientRow.name ?? 'Клиент'}\n\nВ архиве доступен просмотр карточки. Все действия — только после «Вернуть».`)
      if (!ok) return
    }
    const full = await getLocalClient(clientRow.id)
    if (!full) {
      alert('Клиент не найден в локальном кэше. Обновите список.')
      return
    }
    setBusy(true)
    const now = new Date().toISOString()
    const row = { ...full, archived_at: archived ? now : null }
    try {
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: full.id })
      dispatchLocalDataChanged({ reason: 'client-archive-changed', clientId: full.id })
      await reload({ silent: true })
    } catch (err) {
      alert(err?.message ?? 'Не удалось обновить архив')
    } finally {
      setBusy(false)
    }
  }

  const trainerLabel = (tid) => {
    if (!tid) return '—'
    return trainerNameById[tid] ?? (String(tid).length > 10 ? `Тренер ${String(tid).slice(0, 8)}…` : tid)
  }

  const clubQs = club ? `?club=${encodeURIComponent(club)}` : ''

  const closeReassignModal = () => {
    if (reassignBusy) return
    setReassignClient(null)
    setReassignLoadErr('')
    setReassignManualUuid('')
    setTrainerOptions([])
  }

  const openReassignModal = useCallback(async (c) => {
    if (!c?.id) return
    setReassignLoadErr('')
    setReassignManualUuid('')
    setReassignTrainerId(String(c.trainer_id ?? ''))
    setTrainerOptions([])
    setReassignClient({ id: c.id, name: c.name ?? 'Клиент', trainer_id: c.trainer_id })
    try {
      const list = await listTrainerSummariesForAdmin()
      const arr = Array.isArray(list) ? list : []
      setTrainerOptions(arr)
      if (!arr.length && isSupabaseConfigured()) {
        setReassignLoadErr('Список тренеров пуст или нет доступа (RLS). Можно ввести UUID вручную ниже.')
      }
      if (!arr.length && !isSupabaseConfigured()) {
        setReassignLoadErr('Облако не подключено — укажите UUID нового тренера вручную.')
      }
    } catch {
      setReassignLoadErr('Не удалось загрузить список тренеров. Укажите UUID вручную.')
    }
  }, [])

  const applyReassignTrainer = async () => {
    if (!reassignClient?.id) return
    const fromList = reassignTrainerId.trim()
    const fromManual = reassignManualUuid.trim()
    const tid = trainerOptions.length > 0 ? fromList : fromManual
    if (!tid) {
      alert('Выберите тренера или введите UUID.')
      return
    }
    if (tid === reassignClient.trainer_id) {
      closeReassignModal()
      return
    }
    const full = await getLocalClient(reassignClient.id)
    if (!full) {
      alert('Клиент не найден в локальном кэше. Обновите список.')
      return
    }
    setReassignBusy(true)
    try {
      let nextClubId = full.club_id ?? null
      const picked = trainerOptions.find((u) => u.id === tid)
      if (trainerOptions.length > 0 && picked) {
        nextClubId = picked.club_id ?? null
      } else if (isSupabaseConfigured()) {
        const { data: trRow } = await supabase
          .from('users')
          .select('club_id')
          .eq('id', tid)
          .in('role', USERS_TRAINER_ROLES)
          .maybeSingle()
        if (trRow) nextClubId = trRow.club_id ?? nextClubId
      }
      const row = { ...full, trainer_id: tid, club_id: nextClubId }
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: full.id })
      dispatchLocalDataChanged({ reason: 'client-trainer-reassigned', clientId: full.id })
      closeReassignModal()
      await reload()
    } catch (e) {
      alert(e?.message ?? 'Ошибка сохранения')
    } finally {
      setReassignBusy(false)
    }
  }

  const runDeleteClient = async () => {
    if (!confirmDelete?.id) return
    setDeleteBusy(true)
    try {
      await deleteClientAndAllData(confirmDelete.id)
      setConfirmDelete(null)
      await reload()
    } catch (e) {
      alert(e?.message ?? 'Не удалось удалить клиента')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="admin-section-shell admin-section-shell--wide">
      <AdminSectionHeader
        icon={UserCircle}
        title="Клиенты"
        lead="Список как у тренера: абонемент и последняя тренировка. У каждого клиента указан закреплённый тренер (владелец карточки)."
      />

    <div className="grid stagger td-grid">
      <section className="card admin-clients-workspace" id="clients">
        <div className="admin-clients-workspace__toolbar">
          <div className="admin-clients-segment" role="tablist" aria-label="Раздел списка клиентов">
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'active'}
              onClick={() => switchClientsTab('active')}
            >
              Активные
              <span className="admin-clients-segment__count">{operationalClients.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'archive'}
              onClick={() => switchClientsTab('archive')}
            >
              Архив
              <span className="admin-clients-segment__count">{archivedCount}</span>
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-icon-square btn-touch"
            disabled={busy}
            onClick={() => void refreshFromCloud()}
            aria-label="Обновить список из облака"
            title="Обновить из Supabase"
          >
            <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
          </button>
        </div>

        {refreshMsg ? (
          <p className="sync-feedback sync-feedback--ok admin-clients-workspace__note">{refreshMsg}</p>
        ) : null}
        {smsFeedback ? (
          <p
            className={`sync-feedback admin-clients-workspace__note${
              smsFeedback.tone === 'warn' ? ' sync-feedback--warn' : ' sync-feedback--ok'
            }`}
            role="status"
          >
            {smsFeedback.msg}
          </p>
        ) : null}
        {cloudNeedsClub ? (
          <p className="muted admin-clients-workspace__note">
            В облачном режиме выберите <strong>клуб</strong> в панели выше — иначе список клиентов не загружается.
          </p>
        ) : (
          <p className="muted admin-clients-workspace__meta">
            {source === 'remote' || source === 'admin_api' ? (
              <>Данные из <strong>Supabase</strong>{source === 'admin_api' ? ' (через сервер приложения)' : ''}</>
            ) : (
              <>
                С <strong>устройства</strong> (IndexedDB).
                {!club ? ' Выберите клуб в шапке.' : null}
              </>
            )}
          </p>
        )}
        {fallback ? (
          <p className="admin-inline-note admin-clients-workspace__note" style={{ color: 'var(--danger)' }} role="alert">
            Не удалось загрузить с сервера: {fallback}
          </p>
        ) : null}
        {listTruncated ? (
          <p className="muted admin-inline-note admin-clients-workspace__note" role="status">
            С сервера загружено не более <strong>{ADMIN_CLIENTS_REMOTE_LIMIT}</strong> клиентов — список мог быть обрезан.
          </p>
        ) : null}
        {archiveBusy && clientsTab === 'archive' ? (
          <p className="muted admin-inline-note admin-clients-workspace__note" role="status">
            Загрузка архива из облака…
          </p>
        ) : null}

        <div className="admin-clients-workspace__search" role="group" aria-label="Поиск клиента и тренера">
          <div className="admin-clients-search-cell">
            <Search size={18} aria-hidden className="muted u-shrink-0" />
            <input
              className="admin-clients-search-input"
              type="search"
              autoComplete="off"
              placeholder="Фамилия, телефон или номер карты…"
              aria-label="Поиск по клиенту"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="admin-clients-search-cell">
            <UserSearch size={18} aria-hidden className="muted u-shrink-0" />
            <input
              className="admin-clients-search-input"
              type="search"
              autoComplete="off"
              placeholder="Тренер: ФИО…"
              aria-label="Поиск по закреплённому тренеру"
              value={trainerQuery}
              onChange={(e) => setTrainerQuery(e.target.value)}
            />
          </div>
        </div>

        {clientsTab === 'active' ? (
          <AdminClientsBrowseFilters
            counts={filterCounts}
            quickFilter={quickFilter}
            onApply={applyFilter}
          />
        ) : (
          <p className="admin-clients-workspace__archive-hint muted">
            Архивные карточки: просмотр и возврат. Поиск по имени, телефону или тренеру — от 2 символов.
          </p>
        )}

        <div className="admin-clients-workspace__results">
          {showClientList && activeBrowseLabel ? (
            <div className="admin-clients-results-bar">
              <span className="admin-clients-results-bar__label">
                Показано: <strong>{activeBrowseLabel}</strong>
                {filteredClients.length > 0 ? (
                  <span className="muted"> · {filteredClients.length}</span>
                ) : null}
              </span>
              <button type="button" className="btn btn-ghost btn-touch admin-clients-results-bar__clear" onClick={clearBrowseFilter}>
                Сбросить
              </button>
            </div>
          ) : null}

          {!cloudNeedsClub && !showClientList ? (
            <div className="admin-clients-empty" role="status">
              <Search size={28} aria-hidden className="admin-clients-empty__icon" />
              <p className="admin-clients-empty__title">Список скрыт</p>
              <p className="muted admin-clients-empty__text">
                Введите поиск от 2 символов, нажмите карточку сводки{clientsTab === 'active' ? '' : ' или оставайтесь в архиве'} — тогда появятся карточки клиентов.
              </p>
            </div>
          ) : null}

          {!cloudNeedsClub && showClientList && filteredClients.length === 0 ? (
            <div className="admin-clients-empty admin-clients-empty--compact" role="status">
              <p className="muted admin-clients-empty__text" style={{ margin: 0 }}>
                {clients.length === 0 ? 'Нет клиентов по выбранным условиям.' : 'Никто не подходит под фильтр или поиск.'}
              </p>
            </div>
          ) : null}

          {!cloudNeedsClub && showClientList && filteredClients.length > 0 ? (
          <ul className="list admin-clients-list">
            {pagedClients.map((c) => {
              const mlist = memByClient[c.id] ?? []
              const clientTrainings = pageTrainings.filter((t) => t.client_id === c.id)
              const active = pickUsableMembershipForDate(mlist, today)
              const sig = membershipSignal(mlist, today)
              const expiredLeft = active ? null : pickExpiredMembershipWithRemaining(mlist, today)
              const last = lastTrainingDateFromMap(lastTrainingByClient, c.id)
              const inactiveRow = todaySnapshot.inactiveDetailById.get(c.id)
              const inactiveLabel =
                quickFilter === 'inactive' && inactiveRow ? formatInactiveClientListLabel(inactiveRow) : ''
              return (
                <li key={c.id} className="list-item td-client-item">
                  <div className="td-client-card">
                    <div className="td-client-card__top">
                      <div className="td-client-card__who">
                        <span title={sig.label} className="td-client-dot" style={{ background: sig.color }} />
                        <div className="td-client-card__who-text">
                          <strong className="td-client-card__name">
                            {c.name}
                            {String(c.lifecycle ?? '') === 'pnk' ? (
                              <span className="pnk-badge" style={{ marginLeft: 8 }}>
                                ПНК
                              </span>
                            ) : null}
                            {String(c.lifecycle ?? '') === 'pnk_lost' ? (
                              <span className="pnk-badge pnk-badge--lost" style={{ marginLeft: 8 }}>
                                Отказ
                              </span>
                            ) : null}
                          </strong>
                          <div className="td-client-card__phone">{c.phone ?? '—'}</div>
                        </div>
                      </div>
                      <div className="td-client-card__facts" aria-label="Сводка по клиенту">
                        <div className="td-client-fact">
                          <span className="td-client-fact__label">Карта</span>
                          <span className="td-client-fact__value">{String(c.card_number ?? '').trim() || '—'}</span>
                        </div>
                        <div className="td-client-fact">
                          <span className="td-client-fact__label">Тренер</span>
                          <span className="td-client-fact__value">{trainerLabel(c.trainer_id)}</span>
                        </div>
                        <div className="td-client-fact">
                          <span className="td-client-fact__label">Абонемент</span>
                          <span className="td-client-fact__value">
                            {active ? (
                              <>
                                до {formatDateRu(active.end_date)}
                                <span className="td-client-fact__sub"> · {membershipUsageLabel(active, clientTrainings)}</span>
                              </>
                            ) : expiredLeft ? (
                              <>
                                срок {formatDateRu(expiredLeft.end_date)}
                                <span className="td-client-fact__sub">
                                  {' '}
                                  · осталось {remainingTrainingsOnMembership(expiredLeft, clientTrainings) ?? '—'}
                                </span>
                              </>
                            ) : (
                              'нет действующего'
                            )}
                          </span>
                        </div>
                        <div className="td-client-fact">
                          <span className="td-client-fact__label">Последняя</span>
                          <span className="td-client-fact__value">{last}</span>
                        </div>
                      </div>
                      <div className="row td-client-actions">
                        <AdminClientClubSmsButton
                          clubId={club}
                          client={c}
                          mode={smsMode.mode}
                          scenario={smsMode.scenario}
                          scenarioLabel={smsMode.label}
                          memList={mlist}
                          trainerName={trainerNameById[String(c.trainer_id ?? '')] || ''}
                          clubName={clubSmsClubName}
                          today={today}
                          templates={clubSmsTemplates}
                          configured={clubSmsConfigured}
                          busy={busy}
                          sentMarked={clubSmsMarkByClient.has(String(c.id))}
                          markChipLabel={clubSmsMarkChipLabel(
                            viewingSmsFilter,
                            clubSmsMarkByClient.get(String(c.id))?.scenario,
                          )}
                          markTitle={clubSmsMarkTitle(
                            clubSmsMarkByClient.get(String(c.id))?.scenario,
                            viewingSmsFilter,
                          )}
                          onFeedback={onSmsFeedback}
                          onSent={onClubSmsSent}
                        />
                        <Link
                          to={`/admin/clients/${c.id}${clubQs}`}
                          className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                          aria-label="Карточка клиента"
                          title="Карточка клиента"
                        >
                          <UserCircle size={20} aria-hidden />
                        </Link>
                        <ClientRowMoreMenu
                          disabled={busy}
                          ariaLabel={`Ещё действия: ${c.name ?? c.id}`}
                          items={[
                            clientsTab === 'active'
                              ? {
                                  id: 'archive',
                                  label: 'В архив',
                                  icon: Archive,
                                  onSelect: () => void updateClientArchiveFlag(c, true),
                                }
                              : {
                                  id: 'restore',
                                  label: 'Вернуть из архива',
                                  icon: RotateCcw,
                                  onSelect: () => void updateClientArchiveFlag(c, false),
                                },
                            {
                              id: 'reassign',
                              label: 'Переназначить тренера',
                              icon: UserCog,
                              onSelect: () => void openReassignModal(c),
                            },
                            {
                              id: 'delete',
                              label: 'Удалить',
                              icon: Trash2,
                              danger: true,
                              onSelect: () => setConfirmDelete({ id: c.id, name: c.name ?? 'Клиент' }),
                            },
                          ]}
                        />
                      </div>
                    </div>
                    {inactiveLabel ? (
                      <p className="td-client-card__alert" role="status">
                        {inactiveLabel}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}

        {!cloudNeedsClub && showClientList && filteredClients.length > ADMIN_CLIENTS_PAGE_SIZE ? (
          <div className="admin-clients-pagination">
            <span className="muted" style={{ fontSize: 13 }}>
              {pageTrainingsBusy ? 'Загрузка тренировок страницы…' : null}
              {!pageTrainingsBusy ? (
                <>
                  Страница <strong>{listPage + 1}</strong> из <strong>{totalPages}</strong>
                  {' · '}
                  показано {pagedClients.length} из {filteredClients.length}
                </>
              ) : null}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={listPage <= 0 || busy}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
              >
                Назад
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={listPage >= totalPages - 1 || busy}
                onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Вперёд
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </section>

      {reassignClient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-reassign-trainer-title" onClick={closeReassignModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="adm-reassign-trainer-title" className="section-title td-section-title" style={{ marginTop: 0 }}>
              Переназначить тренера
            </h2>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
              Клиент <strong>{reassignClient.name}</strong> появится в списке выбранного тренера. Клуб клиента (зал в карточке) не меняется автоматически.
            </p>
            {reassignLoadErr ? <p className="muted admin-inline-note">{reassignLoadErr}</p> : null}
            {trainerOptions.length > 0 ? (
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor="adm-reassign-tr-select">
                  Тренер
                </label>
                <select
                  id="adm-reassign-tr-select"
                  className="select"
                  value={reassignTrainerId}
                  onChange={(e) => setReassignTrainerId(e.target.value)}
                  disabled={reassignBusy}
                >
                  {reassignClient.trainer_id && !trainerOptions.some((t) => t.id === reassignClient.trainer_id) ? (
                    <option value={reassignClient.trainer_id}>Текущий тренер (не в списке)</option>
                  ) : null}
                  {trainerOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? t.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor="adm-reassign-tr-uuid">
                  UUID тренера (trainer_id)
                </label>
                <input
                  id="adm-reassign-tr-uuid"
                  className="input"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={reassignManualUuid}
                  onChange={(e) => setReassignManualUuid(e.target.value)}
                  disabled={reassignBusy}
                  autoComplete="off"
                />
              </div>
            )}
            <div className="row td-modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-touch" onClick={closeReassignModal} disabled={reassignBusy}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary btn-touch" disabled={reassignBusy} onClick={() => void applyReassignTrainer()}>
                {reassignBusy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-delete-client-title" onClick={() => !deleteBusy && setConfirmDelete(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 id="adm-delete-client-title" className="section-title" style={{ marginTop: 0 }}>
              Удалить клиента?
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Удаляем <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong> без возможности восстановления.
            </p>
            <p className="muted" style={{ marginTop: 10, fontSize: '0.9rem' }}>
              Удалятся все тренировки, абонементы, замеры тела и медкарта этого клиента.
            </p>
            <div className="row td-modal-actions" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost btn-touch" disabled={deleteBusy} onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-touch"
                style={{ background: 'rgba(248,113,113,0.2)', borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
                disabled={deleteBusy}
                onClick={() => void runDeleteClient()}
              >
                {deleteBusy ? 'Удаление…' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </section>
  )
}
