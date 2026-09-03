import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Phone, RefreshCw, Search, UserCircle, UserPlus, UserSearch } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminClientCallHistorySheet } from '../../components/admin/AdminClientCallHistorySheet.jsx'
import { AdminClubSmsCampaignBar } from '../../components/admin/AdminClubSmsCampaignBar.jsx'
import { AdminClubSmsCampaignComposeSheet } from '../../components/admin/AdminClubSmsCampaignComposeSheet.jsx'
import { AdminClubSmsCampaignConfirmModal } from '../../components/admin/AdminClubSmsCampaignConfirmModal.jsx'
import { AdminClubSmsCampaignResultModal } from '../../components/admin/AdminClubSmsCampaignResultModal.jsx'
import { AdminClubSmsJournalSection } from '../../components/admin/AdminClubSmsJournalSection.jsx'
import { useLoyaltyGlanceMap } from '../../hooks/useLoyaltyGlanceMap.js'
import { useAdminClubSmsCampaign } from './useAdminClubSmsCampaign.js'
import { useAdminClientsClubSms } from './useAdminClientsClubSms.js'
import { AdminClientsBrowseFilters } from '../../components/admin/AdminClientsBrowseFilters.jsx'
import { AdminClientsAzDirectionFilters } from '../../components/admin/AdminClientsAzDirectionFilters.jsx'
import { AdminClientsArchiveHallFilters } from '../../components/admin/AdminClientsArchiveHallFilters.jsx'
import { AdminClientsListRow } from '../../components/admin/AdminClientsListRow.jsx'
import {
  deleteClientAndAllData,
  listAdminClientsForClub,
  listTrainerSummariesForAdmin,
} from '../../lib/dataAccess'
import { isAdminClientQuickFilter, normalizeAdminClientQuickFilter } from '../../lib/admin/adminClientQuickFilters'
import {
  AZ_DIRECTION_FILTER_ALL,
  buildAzDirectionFilterOptions,
  clientMatchesAzDirectionFilter,
  normalizeAzDirectionFilterId,
} from '../../lib/admin/adminClientsAzDirectionFilterCore.js'
import {
  ARCHIVE_HALL_FILTER_ALL,
  ARCHIVE_HALL_FILTER_LABELS,
  archiveClientHall,
  buildArchiveHallFilterOptions,
  clientMatchesArchiveHallFilter,
  normalizeArchiveHallFilter,
} from '../../lib/admin/adminClientsArchiveHallCore.js'
import {
  adminClientsAllTileLabel,
  adminClientsCrossHallSearchNote,
  buildAdminClientsBrowseCounts,
  buildAdminClientsTodaySnapshot,
  filterAdminClientsByBrowseMode,
  formatAdminClientsResultsShown,
  isAdminClientsBrowseMode,
  shouldApplyAdminClientsBrowseFilterToList,
  shouldShowAdminClientsList,
} from '../../lib/admin/adminClientsBrowseCore'
import {
  BIRTHDAY_WINDOW_DAYS,
  partitionBirthdayBrowseClients,
  sortClientsForBirthdayBrowse,
  withBirthdayBrowseSectionBreaks,
} from '../../lib/clientBirthdays.js'
import { BirthdayBrowseSectionHeader } from '../../components/clients/BirthdayBrowseSectionHeader.jsx'
import { loadAdminClubMembershipsMap, loadAdminClubTrainingsForClientIds } from '../../lib/admin/adminClubWorkspaceCache'
import { fetchClientsLastTrainingsViaApi } from '../../lib/admin/adminApiClient'
import { resolveClubSmsMode } from '../../lib/admin/clubSmsModeCore.js'
import { peekAdminClientsListLocal, pullAdminClientsFromCloud } from '../../lib/admin/adminClientsListService'
import {
  peekAdminClientsListMemory,
  writeAdminClientsListMemory,
} from '../../lib/admin/adminClientsListMemoryCache.js'
import { invalidateAdminClientsBrowseGlanceCaches } from '../../lib/admin/adminClientsListReloadCore.js'
import { useDebouncedStorageReload, shouldReloadAdminClientsPage } from '../../lib/useDebouncedStorageReload'
import { ADMIN_CLIENTS_PAGE_SIZE, ADMIN_CLIENTS_REMOTE_LIMIT } from '../../lib/admin/adminConstants'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
} from '../../lib/syncService'
import { todayInTimeZoneIso } from '../../lib/dateRu'
import {
  clientMatchesAdminSearchQuery,
  resolveAdminClientsSearchPool,
  shouldSearchAcrossHalls,
} from '../../lib/admin/adminClientsCrossHallSearchCore.js'
import {
  buildAdminClientCardHref,
  parseAdminClientsListPage,
} from '../../lib/admin/adminClientsListHrefCore.js'
import {
  ADMIN_CLIENTS_LIST_TAB_LABELS,
  countClientsByAdminListTab,
  filterClientsByAdminListTab,
  normalizeAdminClientsListTab,
} from '../../lib/admin/deskHallClientsCore.js'
import { collectNoTabletTrainerIds } from '../../lib/admin/trainerTabletModeCore.js'
import { collectHoldingTrainerIds } from '../../lib/admin/holdingClientsCore.js'
import { ClientHardDeleteConfirmModal } from '../../components/ClientHardDeleteConfirmModal.jsx'
import { ClientArchiveReasonModal } from '../../components/ClientArchiveReasonModal.jsx'
import { setClientArchiveReason } from '../../lib/clientArchiveSyncService.js'
import {
  closeClientHallWithReason,
  leaveClubWithReason,
  reopenClientHall,
  restoreClientFromClubArchive,
} from '../../lib/clientHallLifecycleSyncService.js'
import {
  adminClientsCloseHallModalCopy,
  resolveAdminClientsActionHall,
} from '../../lib/admin/adminClientsHallLifecycleMenuCore.js'
import {
  loadAdminClubLifecycleRowsFromLocal,
} from '../../lib/admin/adminClientsListLifecycleCore.js'
import { AdminClientCreateModal } from '../../components/admin/AdminClientCreateModal.jsx'
import { manualCreateHallFromClientsTab } from '../../lib/admin/deskManualClientCreateCore.js'
import { filterAerobicSalesTypes } from '../../lib/membershipTypesCore.js'
import { ensureMembershipTypesForClub } from '../../lib/membershipTypesService.js'
import { buildLastTrainingMap } from '../../lib/admin/adminClientsListRowHelpers.js'
import '../../styles/pnk-funnel.css'
import '../../styles/sales-clients.css'

/**
 * @param {{ accessMode?: 'admin' | 'sales_manager' | 'supervisor', listUiActive?: boolean }} [props]
 */
export function AdminClients({ accessMode = 'admin', listUiActive = true } = {}) {
  const isSalesManager = accessMode === 'sales_manager'
  const isSupervisor = accessMode === 'supervisor'
  const clubBound = isSalesManager || isSupervisor
  const { user } = useAuth()
  const ctx = useOutletContext()
  const navigate = useNavigate()
  const clubIdCtx = clubBound
    ? String(user?.club_id ?? '').trim()
    : String(ctx?.clubId ?? '').trim()
  const clientsBasePath =
    accessMode === 'sales_manager'
      ? '/sales/clients'
      : accessMode === 'supervisor'
        ? '/club/clients'
        : '/admin/clients'
  const [searchParams, setSearchParams] = useSearchParams()
  const club = clubBound
    ? clubIdCtx
    : searchParams.get('club') ?? clubIdCtx ?? ''
  const callLogHref = isSalesManager
    ? '/sales/call-log'
    : isSupervisor
      ? '/club/call-log'
      : `/admin/call-log${club ? `?club=${encodeURIComponent(club)}` : ''}`
  const filterFromUrl = searchParams.get('filter')
  const listTabFromUrl = searchParams.get('clientsTab') || searchParams.get('list')

  const [clients, setClients] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [lastTrainingByClient, setLastTrainingByClient] = useState({})
  const [pageTrainings, setPageTrainings] = useState([])
  const [trainerNameById, setTrainerNameById] = useState({})
  const [trainersForClub, setTrainersForClub] = useState([])
  const [noTabletTrainerIds, setNoTabletTrainerIds] = useState(() => new Set())
  const [holdingTrainerIds, setHoldingTrainerIds] = useState(() => new Set())
  const [clientCreateOpen, setClientCreateOpen] = useState(false)
  const [callHistoryClient, setCallHistoryClient] = useState(null)
  const [callHistTick, setCallHistTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [listPage, setListPage] = useState(() => parseAdminClientsListPage(searchParams.get('page')))
  const [pageTrainingsBusy, setPageTrainingsBusy] = useState(false)
  const [query, setQuery] = useState(() => String(searchParams.get('q') ?? ''))
  const [trainerQuery, setTrainerQuery] = useState(() => String(searchParams.get('trainer') ?? ''))
  const [quickFilter, setQuickFilter] = useState(() => {
    const n = normalizeAdminClientQuickFilter(filterFromUrl)
    return isAdminClientQuickFilter(n) ? n : 'none'
  })
  const [clientsTab, setClientsTab] = useState(() => normalizeAdminClientsListTab(listTabFromUrl))
  const [archiveHallFilter, setArchiveHallFilter] = useState(() =>
    normalizeArchiveHallFilter(searchParams.get('archiveHall')),
  )
  const [lifecycleRows, setLifecycleRows] = useState([])
  /** Вкладки/воронка без lifecycle врут (клиент «закрыт на ПЗ» остаётся в ПЗ). */
  const [lifecycleReady, setLifecycleReady] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [source, setSource] = useState('local')
  const [fallback, setFallback] = useState(null)
  const [cloudNeedsClub, setCloudNeedsClub] = useState(false)
  const [listTruncated, setListTruncated] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  /** @type {[{ mode: 'enter' | 'edit', client: object } | null, Function]} */
  const [archiveReasonModal, setArchiveReasonModal] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [azMembershipTypes, setAzMembershipTypes] = useState([])
  const [membershipTypes, setMembershipTypes] = useState([])
  const [azDirectionFilter, setAzDirectionFilter] = useState(AZ_DIRECTION_FILTER_ALL)
  /** Не сбрасывать page из URL, пока список ещё не подгрузился. */
  const [listReady, setListReady] = useState(false)

  const {
    clubSmsConfigured,
    clubSmsTemplates,
    clubSmsClubName,
    smsFeedback,
    smsJournalOpen,
    setSmsJournalOpen,
    onSmsFeedback,
    onClubSmsSent,
    refreshClubSmsLogsFromCloud,
    viewingSmsFilter,
    clubSmsMarkByClient,
  } = useAdminClientsClubSms({ club, clients, memByClient, quickFilter })

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setBusy(true)
      setLifecycleReady(false)
    }
    try {
      const lifeFromLocal = club ? await loadAdminClubLifecycleRowsFromLocal(club) : []

      // Фаза 0: paint из IDB (клиенты + абоны + lifecycle); цифры — после фазы 1.
      if (club && !silent) {
        const mem = peekAdminClientsListMemory(club)
        let peekLocal = null
        let mapPeek = mem?.memByClient ?? {}
        try {
          ;[peekLocal, mapPeek] = await Promise.all([
            peekAdminClientsListLocal(club),
            loadAdminClubMembershipsMap(club),
          ])
        } catch {
          /* memory fallback ниже */
        }
        const clientsPaint =
          peekLocal?.clients?.length ? peekLocal.clients : mem?.clients?.length ? mem.clients : []
        if (clientsPaint.length) {
          setClients(clientsPaint)
          setMemByClient(mapPeek ?? {})
          setLifecycleRows(lifeFromLocal)
          setTrainerNameById(mem?.trainerNameById ?? {})
          setNoTabletTrainerIds(new Set(mem?.noTabletTrainerIds ?? []))
          setHoldingTrainerIds(new Set(mem?.holdingTrainerIds ?? []))
          setListTruncated(!!(peekLocal?.truncated ?? mem?.truncated))
          setSource(peekLocal?.clients?.length ? 'local' : mem?.source || 'local')
          setFallback(null)
          setCloudNeedsClub(false)
          setListReady(true)
          if (!silent) setBusy(false)
        }
      }

      // Фаза 1: IndexedDB.
      if (club) {
        try {
          const [peek, trainersPeek, lifePeek, mapPeek] = await Promise.all([
            peekAdminClientsListLocal(club),
            listTrainerSummariesForAdmin(),
            loadAdminClubLifecycleRowsFromLocal(club),
            loadAdminClubMembershipsMap(club),
          ])
          const nmPeek = {}
          for (const u of trainersPeek) {
            nmPeek[u.id] = u.name?.trim() || '—'
          }
          setTrainerNameById(nmPeek)
          let clubTrainersPeek = Array.isArray(trainersPeek) ? trainersPeek : []
          if (clubBound && club) {
            clubTrainersPeek = clubTrainersPeek.filter((t) => String(t.club_id ?? '').trim() === String(club))
          }
          setTrainersForClub(clubTrainersPeek)
          const noTabletPeek = collectNoTabletTrainerIds(clubTrainersPeek)
          const holdingPeek = collectHoldingTrainerIds(clubTrainersPeek)
          setNoTabletTrainerIds(noTabletPeek)
          setHoldingTrainerIds(holdingPeek)
          if (peek.clients?.length) {
            setClients(peek.clients)
            setListTruncated(!!peek.truncated)
            setSource('local')
            setFallback(null)
            setCloudNeedsClub(false)
            setMemByClient(mapPeek)
            setLifecycleRows(lifePeek)
            setLifecycleReady(true)
            writeAdminClientsListMemory(club, {
              clients: peek.clients,
              memByClient: mapPeek,
              lifecycleRows: lifePeek,
              trainerNameById: nmPeek,
              noTabletTrainerIds: noTabletPeek,
              holdingTrainerIds: holdingPeek,
              truncated: !!peek.truncated,
              source: 'local',
            })
            setListReady(true)
            if (!silent) setBusy(false)
          }
        } catch {
          /* фаза 2 всё равно подтянет */
        }
      }

      const [{ clients: list, source: src, fallbackReason, cloudNeedsClub: need, truncated: trunc }, trainers, lifeCloud] =
        await Promise.all([
          listAdminClientsForClub({ clubId: club || '' }),
          listTrainerSummariesForAdmin(),
          club ? loadAdminClubLifecycleRowsFromLocal(club) : Promise.resolve([]),
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
      let clubTrainers = Array.isArray(trainers) ? trainers : []
      if (clubBound && club) {
        clubTrainers = clubTrainers.filter((t) => String(t.club_id ?? '').trim() === String(club))
      }
      setTrainersForClub(clubTrainers)
      const noTablet = collectNoTabletTrainerIds(clubTrainers)
      const holding = collectHoldingTrainerIds(clubTrainers)
      setNoTabletTrainerIds(noTablet)
      setHoldingTrainerIds(holding)

      const arr = Array.isArray(list) ? list : []
      const map = club ? await loadAdminClubMembershipsMap(club) : {}
      setClients(arr)
      setMemByClient(map)
      setLifecycleRows(lifeCloud)
      setLifecycleReady(true)
      // Не сбрасываем lastTrainingByClient — иначе колонка «Последняя» мигает «—» на каждой перезагрузке.
      setPageTrainings([])

      if (club && arr.length) {
        writeAdminClientsListMemory(club, {
          clients: arr,
          memByClient: map,
          lifecycleRows: lifeCloud,
          trainerNameById: nm,
          noTabletTrainerIds: noTablet,
          holdingTrainerIds: holding,
          truncated: !!trunc,
          source: src || 'remote',
        })
      }
    } catch {
      setClients([])
      setMemByClient({})
      setLifecycleRows([])
      setLifecycleReady(false)
      setLastTrainingByClient({})
      setPageTrainings([])
      setTrainerNameById({})
      setSource('local')
      setFallback(null)
      setCloudNeedsClub(false)
      setListTruncated(false)
      if (club) invalidateAdminClientsBrowseGlanceCaches(club)
    } finally {
      setListReady(true)
      if (!silent) setBusy(false)
    }
  }, [club, clubBound])

  useEffect(() => {
    setLifecycleReady(false)
    setLifecycleRows([])
  }, [club])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadAdminClientsPage })

  /** Keep-alive: «назад» с карточки — clients + lifecycle + абоны из IDB. */
  useEffect(() => {
    if (!listUiActive || !club) return
    let cancelled = false
    void (async () => {
      try {
        const [peek, life, map] = await Promise.all([
          peekAdminClientsListLocal(club),
          loadAdminClubLifecycleRowsFromLocal(club),
          loadAdminClubMembershipsMap(club),
        ])
        if (cancelled) return
        if (peek?.clients?.length) setClients(peek.clients)
        setLifecycleRows(life)
        setMemByClient(map)
        setLifecycleReady(true)
      } catch {
        if (!cancelled) setLifecycleReady(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [listUiActive, club])

  /** Восстановление списка после «назад» с карточки (вкладка / фильтр / страница / поиск). */
  useEffect(() => {
    if (!listUiActive) return
    const rawFilter = searchParams.get('filter')
    let n = normalizeAdminClientQuickFilter(rawFilter)
    if (rawFilter === 'expired_remaining' || rawFilter === 'active_today') {
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
    const nextTab = normalizeAdminClientsListTab(
      searchParams.get('clientsTab') || searchParams.get('list'),
    )
    setClientsTab(nextTab)
    // Архив + воронка из URL = пустой список (воронка считает живых). Сбрасываем.
    if (nextTab === 'archive') {
      setQuickFilter('none')
      if (rawFilter) {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev)
            p.delete('filter')
            return p
          },
          { replace: true },
        )
      }
    } else if (isAdminClientQuickFilter(n)) {
      setQuickFilter(n)
    } else if (!rawFilter) {
      setQuickFilter('none')
    }

    setArchiveHallFilter(normalizeArchiveHallFilter(searchParams.get('archiveHall')))
    setListPage(parseAdminClientsListPage(searchParams.get('page')))
    setQuery(String(searchParams.get('q') ?? ''))
    setTrainerQuery(String(searchParams.get('trainer') ?? ''))
  }, [searchParams, setSearchParams, listUiActive])

  const patchListSearch = useCallback(
    (mutate, { resetPage = false } = {}) => {
      if (!listUiActive) return
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          mutate(p)
          if (resetPage) p.delete('page')
          if (clubBound) p.delete('club')
          else if (club) p.set('club', club)
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams, clubBound, club, listUiActive],
  )

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

  useEffect(() => {
    if (!club?.trim()) {
      setMembershipTypes([])
      return undefined
    }
    let cancelled = false
    void ensureMembershipTypesForClub(club)
      .then((res) => {
        if (!cancelled) setMembershipTypes(Array.isArray(res?.types) ? res.types : [])
      })
      .catch(() => {
        if (!cancelled) setMembershipTypes([])
      })
    return () => {
      cancelled = true
    }
  }, [club])

  useEffect(() => {
    if (!club?.trim()) {
      setAzMembershipTypes([])
      return undefined
    }
    const needAzTypes = clientsTab === 'az' || clientCreateOpen
    if (!needAzTypes) {
      setAzMembershipTypes([])
      setAzDirectionFilter(AZ_DIRECTION_FILTER_ALL)
      return undefined
    }
    let cancelled = false
    void ensureMembershipTypesForClub(club, { aerobicOnly: true, activeOnly: true })
      .then((res) => {
        if (!cancelled) setAzMembershipTypes(Array.isArray(res?.types) ? res.types : [])
      })
      .catch(() => {
        if (!cancelled) setAzMembershipTypes([])
      })
    return () => {
      cancelled = true
    }
  }, [clientsTab, club, clientCreateOpen])

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

  const today = todayInTimeZoneIso()

  const allMemberships = useMemo(() => {
    const out = []
    for (const list of Object.values(memByClient)) out.push(...(list ?? []))
    return out
  }, [memByClient])

  const todaySnapshot = useMemo(
    () => buildAdminClientsTodaySnapshot(clients, allMemberships, today, holdingTrainerIds, noTabletTrainerIds),
    [clients, allMemberships, today, holdingTrainerIds, noTabletTrainerIds],
  )

  const showClientList = useMemo(
    () =>
      shouldShowAdminClientsList({
        query,
        trainerQuery,
        browseMode: quickFilter,
        clientsTab,
        azDirectionFilter: clientsTab === 'az' ? azDirectionFilter : '',
      }),
    [query, trainerQuery, quickFilter, clientsTab, azDirectionFilter],
  )

  const listLifecycleCtx = useMemo(
    () => ({ lifecycleRows, asOf: today }),
    [lifecycleRows, today],
  )

  const filterClientsByTabWithLifecycle = useCallback(
    (list, tab, memBy) => filterClientsByAdminListTab(list, tab, memBy, listLifecycleCtx),
    [listLifecycleCtx],
  )

  const listTabCounts = useMemo(
    () => countClientsByAdminListTab(clients, memByClient, listLifecycleCtx),
    [clients, memByClient, listLifecycleCtx],
  )
  const isDeskHallTab = clientsTab === 'tz' || clientsTab === 'az'
  const archiveHallOptions = useMemo(
    () =>
      clientsTab === 'archive'
        ? buildArchiveHallFilterOptions(clients, memByClient, listLifecycleCtx)
        : [],
    [clientsTab, clients, memByClient, listLifecycleCtx],
  )
  const showTrainerSearch =
    !isDeskHallTab &&
    !(clientsTab === 'archive' && (archiveHallFilter === 'tz' || archiveHallFilter === 'az'))

  const crossHallSearch = shouldSearchAcrossHalls(query, clientsTab)

  // Cross-hall поиск: сбрасываем воронку и направление АЗ — иначе chip≠list.
  useEffect(() => {
    if (!crossHallSearch) return
    setAzDirectionFilter(AZ_DIRECTION_FILTER_ALL)
    if (quickFilter === 'none') return
    setQuickFilter('none')
    setListPage(0)
    patchListSearch((p) => {
      p.delete('filter')
    }, { resetPage: true })
  }, [crossHallSearch]) // сброс только при входе в cross-hall поиск

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const tq = trainerQuery.trim().toLowerCase()

    const browseOnly =
      !crossHallSearch &&
      shouldApplyAdminClientsBrowseFilterToList(clientsTab, quickFilter) &&
      !q &&
      !tq &&
      !(clientsTab === 'archive' && normalizeArchiveHallFilter(archiveHallFilter))

    if (!lifecycleReady && browseOnly) {
      return []
    }

    let base = resolveAdminClientsSearchPool({
      clients,
      clientsTab,
      query,
      memByClient,
      filterByTab: filterClientsByTabWithLifecycle,
      lifecycleCtx: listLifecycleCtx,
    })
    if (clientsTab === 'archive' && normalizeArchiveHallFilter(archiveHallFilter)) {
      base = base.filter((c) =>
        clientMatchesArchiveHallFilter(c, archiveHallFilter, memByClient[c.id] ?? []),
      )
    }
    if (q) {
      base = base.filter((c) => clientMatchesAdminSearchQuery(c, q))
    }
    if (tq && showTrainerSearch) {
      base = base.filter((c) => {
        const trainerName = String(trainerNameById[c.trainer_id] ?? '').toLowerCase()
        return trainerName && trainerName.includes(tq)
      })
    }

    // Воронка без поиска — тот же контур, что и цифры на плитках (chip = list).
    if (browseOnly) {
      return filterAdminClientsByBrowseMode({
        clients,
        memByClient,
        clientsTab,
        today,
        browseMode: quickFilter,
        azDirectionFilter: clientsTab === 'az' ? azDirectionFilter : '',
        lifecycleRows,
        lastTrainingByClient,
      })
    }

    // Воронка + поиск / тренер / архивный зал — пересечение с базой вкладки.
    if (
      !crossHallSearch &&
      shouldApplyAdminClientsBrowseFilterToList(clientsTab, quickFilter)
    ) {
      const allowed = new Set(
        filterAdminClientsByBrowseMode({
          clients,
          memByClient,
          clientsTab,
          today,
          browseMode: quickFilter,
          azDirectionFilter: clientsTab === 'az' ? azDirectionFilter : '',
          lifecycleRows,
          lastTrainingByClient,
        }).map((c) => String(c.id)),
      )
      base = base.filter((c) => allowed.has(String(c.id)))
    } else if (
      !crossHallSearch &&
      clientsTab === 'az' &&
      normalizeAzDirectionFilterId(azDirectionFilter) &&
      (quickFilter === 'none' || !isAdminClientsBrowseMode(quickFilter))
    ) {
      base = base.filter((c) =>
        clientMatchesAzDirectionFilter(memByClient[c.id] ?? [], azDirectionFilter, today, c),
      )
    }

    if (quickFilter === 'birthdays') {
      base = sortClientsForBirthdayBrowse(base, today)
    }

    return base
  }, [
    clients,
    clientsTab,
    archiveHallFilter,
    query,
    trainerQuery,
    quickFilter,
    azDirectionFilter,
    memByClient,
    today,
    trainerNameById,
    isDeskHallTab,
    showTrainerSearch,
    crossHallSearch,
    lifecycleRows,
    lifecycleReady,
    filterClientsByTabWithLifecycle,
    listLifecycleCtx,
  ])

  const azDirectionOptions = useMemo(() => {
    if (clientsTab !== 'az') return []
    // Всегда пул вкладки АЗ (не выдача поиска) — иначе muted-чипы врут и пропадают направления.
    const pool = filterClientsByAdminListTab(clients, 'az', memByClient, listLifecycleCtx)
    return buildAzDirectionFilterOptions({
      clients: pool,
      memByClient,
      azTypes: azMembershipTypes,
      todayIso: today,
    })
  }, [clientsTab, clients, memByClient, azMembershipTypes, today, listLifecycleCtx])

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / ADMIN_CLIENTS_PAGE_SIZE))

  useEffect(() => {
    if (!listReady) return
    if (listPage > totalPages - 1) {
      const next = Math.max(0, totalPages - 1)
      setListPage(next)
      patchListSearch((p) => {
        if (next <= 0) p.delete('page')
        else p.set('page', String(next + 1))
      })
    }
  }, [listReady, listPage, totalPages, patchListSearch])

  const goListPage = useCallback(
    (nextPage) => {
      const next = Math.max(0, Math.min(totalPages - 1, nextPage))
      setListPage(next)
      patchListSearch((p) => {
        if (next <= 0) p.delete('page')
        else p.set('page', String(next + 1))
      })
    },
    [totalPages, patchListSearch],
  )

  const listNavState = useMemo(
    () => ({
      clubId: clubBound ? '' : club,
      clientsTab,
      archiveHall: clientsTab === 'archive' ? archiveHallFilter : '',
      filter: quickFilter,
      page: listPage + 1,
      query,
      trainerQuery,
      hall: clientsTab === 'archive' ? '' : resolveAdminClientsActionHall(clientsTab) || '',
    }),
    [clubBound, club, clientsTab, archiveHallFilter, quickFilter, listPage, query, trainerQuery],
  )

  const cardHrefForClient = (clientId, hallOverride = '') => {
    const id = String(clientId ?? '').trim()
    let hall = String(hallOverride ?? '').trim()
    if (!hall && clientsTab === 'archive') {
      const row = clients.find((c) => String(c?.id) === id)
      hall = archiveClientHall(row, memByClient[id] ?? [])
    } else if (!hall) {
      hall = resolveAdminClientsActionHall(clientsTab) || ''
    }
    return buildAdminClientCardHref(clientsBasePath, id, { ...listNavState, hall })
  }

  const pagedClients = useMemo(() => {
    const start = listPage * ADMIN_CLIENTS_PAGE_SIZE
    return filteredClients.slice(start, start + ADMIN_CLIENTS_PAGE_SIZE)
  }, [filteredClients, listPage])

  const birthdaySectionCounts = useMemo(() => {
    if (quickFilter !== 'birthdays') return null
    const parts = partitionBirthdayBrowseClients(filteredClients, today)
    return { today: parts.today.length, upcoming: parts.upcoming.length }
  }, [quickFilter, filteredClients, today])

  const pagedListItems = useMemo(() => {
    if (quickFilter === 'birthdays') {
      return withBirthdayBrowseSectionBreaks(pagedClients, today, birthdaySectionCounts)
    }
    return pagedClients.map((client) => ({ type: 'client', client }))
  }, [quickFilter, pagedClients, today, birthdaySectionCounts])

  const loyaltyGlanceById = useLoyaltyGlanceMap(pagedClients)

  /** Стабильный ключ id страницы (порядок не важен) — смена сегмента с тем же набором не дёргает даты. */
  const pagedClientIdsKey = useMemo(() => {
    const ids = pagedClients.map((c) => String(c.id ?? '').trim()).filter(Boolean)
    ids.sort()
    return ids.join(',')
  }, [pagedClients])

  const lastTrainingRef = useRef(lastTrainingByClient)
  lastTrainingRef.current = lastTrainingByClient

  useEffect(() => {
    setLastTrainingByClient({})
    setPageTrainings([])
  }, [club])

  useEffect(() => {
    const ids = pagedClientIdsKey ? pagedClientIdsKey.split(',').filter(Boolean) : []
    if (!club?.trim() || !ids.length) {
      setPageTrainings([])
      setPageTrainingsBusy(false)
      return
    }
    let cancelled = false
    const known = lastTrainingRef.current
    const missing = ids.filter((id) => !Object.prototype.hasOwnProperty.call(known, id))
    const needDates = missing.length > 0
    // Мигание при ПЗ|ТЗ|АЗ: не ставим busy, если даты уже в карте.
    if (needDates) setPageTrainingsBusy(true)

    void (async () => {
      try {
        const trainingsPromise = loadAdminClubTrainingsForClientIds(club, ids)
        /** @type {Record<string, string>} */
        let map = {}
        if (needDates && isSupabaseConfigured() && navigator.onLine) {
          try {
            const remote = await fetchClientsLastTrainingsViaApi({ clubId: club, clientIds: missing })
            const remoteMap = remote?.lastByClient ?? {}
            for (const id of missing) {
              map[id] = remoteMap[id] ? String(remoteMap[id]).slice(0, 10) : ''
            }
          } catch {
            /* fallback IDB */
          }
        }
        const rows = await trainingsPromise
        if (needDates) {
          const fromIdb = buildLastTrainingMap(rows)
          for (const id of missing) {
            const remoteIso = map[id]
            const idbIso = fromIdb[id] ? String(fromIdb[id]).slice(0, 10) : ''
            // Склеиваем remote и IDB: не оставляем '' если в дневнике есть дата.
            if (remoteIso && idbIso) map[id] = remoteIso >= idbIso ? remoteIso : idbIso
            else if (idbIso) map[id] = idbIso
            else if (!Object.prototype.hasOwnProperty.call(map, id)) map[id] = ''
          }
        }
        if (!cancelled) {
          setPageTrainings(rows)
          if (Object.keys(map).length) {
            setLastTrainingByClient((prev) => ({ ...prev, ...map }))
          }
        }
      } catch {
        if (!cancelled) setPageTrainings([])
      } finally {
        if (!cancelled) setPageTrainingsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [club, pagedClientIdsKey])

  // Фоновая догрузка last-training по всему клубу (ПЗ): иначе filter/count
  // «Выпали из ритма» ложно пустые или ложные до визита каждой страницы.
  const allClientIdsKey = useMemo(() => {
    const ids = clients.map((c) => String(c?.id ?? '').trim()).filter(Boolean)
    ids.sort()
    return ids.join(',')
  }, [clients])

  useEffect(() => {
    if (clientsTab !== 'pz' || !lifecycleReady) return
    if (!club?.trim() || !allClientIdsKey) return
    if (!isSupabaseConfigured() || !navigator.onLine) return
    const ids = allClientIdsKey.split(',').filter(Boolean)
    const known = lastTrainingRef.current
    const missing = ids.filter((id) => !Object.prototype.hasOwnProperty.call(known, id))
    if (!missing.length) return
    let cancelled = false
    void (async () => {
      for (let i = 0; i < missing.length; i += 50) {
        if (cancelled) return
        const chunk = missing.slice(i, i + 50)
        try {
          const remote = await fetchClientsLastTrainingsViaApi({ clubId: club, clientIds: chunk })
          const remoteMap = remote?.lastByClient ?? {}
          /** @type {Record<string, string>} */
          const map = {}
          for (const id of chunk) {
            map[id] = remoteMap[id] ? String(remoteMap[id]).slice(0, 10) : ''
          }
          if (!cancelled && Object.keys(map).length) {
            setLastTrainingByClient((prev) => ({ ...prev, ...map }))
          }
        } catch {
          break
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [club, clientsTab, lifecycleReady, allClientIdsKey])

  const filterCounts = useMemo(() => {
    if (!lifecycleReady) {
      return {
        all: 0,
        pnk: 0,
        inactive: 0,
        awaiting_start: 0,
        birthdays: 0,
        expiring: 0,
        expired_recent: 0,
        stale: 0,
        attendance_slip: 0,
      }
    }
    return buildAdminClientsBrowseCounts({
      clients,
      memByClient,
      clientsTab,
      today,
      azDirectionFilter:
        clientsTab === 'az' && !crossHallSearch ? azDirectionFilter : '',
      lifecycleRows,
      lastTrainingByClient,
    })
  }, [
    lifecycleReady,
    clients,
    clientsTab,
    memByClient,
    today,
    azDirectionFilter,
    lifecycleRows,
    crossHallSearch,
    lastTrainingByClient,
  ])

  const allTileLabel = adminClientsAllTileLabel(clientsTab, filterCounts)

  const browseFilterLabels = {
    all: allTileLabel,
    pnk: 'Воронка ПНК',
    inactive: 'Не активные (финал воронки)',
    awaiting_start: 'Ждёт старт абонемента',
    birthdays: `ДР: сегодня и ближайшие ${BIRTHDAY_WINDOW_DAYS} дн.`,
    expiring: 'Истекает абонемент',
    expired_recent: 'Абонемент закончился',
    stale: 'Давно не был',
    attendance_slip: 'Выпали из ритма',
  }

  const azDirectionShownLabel = useMemo(() => {
    if (clientsTab !== 'az') return null
    const want = normalizeAzDirectionFilterId(azDirectionFilter)
    if (!want) return null
    const opt = azDirectionOptions.find((o) => o.id === want)
    return opt?.label || want
  }, [clientsTab, azDirectionFilter, azDirectionOptions])

  const resultsShown = useMemo(
    () =>
      formatAdminClientsResultsShown({
        crossHallSearch,
        browseMode: clientsTab === 'archive' ? 'none' : quickFilter,
        browseLabel: browseFilterLabels[quickFilter] ?? null,
        azDirectionLabel: azDirectionShownLabel,
        listLength: filteredClients.length,
      }),
    // browseFilterLabels стабилен по ключам; allTileLabel / BIRTHDAY в deps через quickFilter+allTileLabel
    [crossHallSearch, clientsTab, quickFilter, allTileLabel, azDirectionShownLabel, filteredClients.length],
  )
  const smsMode = useMemo(() => resolveClubSmsMode(quickFilter), [quickFilter])
  const smsCampaign = useAdminClubSmsCampaign({
    clubId: club,
    filteredClients,
    memByClient,
    smsMode,
    clubName: clubSmsClubName,
    templates: clubSmsTemplates,
    today,
    trainerNameById,
    configured: clubSmsConfigured,
    onFeedback: onSmsFeedback,
    onSent: onClubSmsSent,
    onCampaignDone: () => {
      void refreshClubSmsLogsFromCloud()
    },
  })

  const clearBrowseFilter = () => {
    setQuickFilter('none')
    setAzDirectionFilter(AZ_DIRECTION_FILTER_ALL)
    setListPage(0)
    patchListSearch((p) => {
      p.delete('filter')
    }, { resetPage: true })
  }

  const switchClientsTab = (tab) => {
    const next = normalizeAdminClientsListTab(tab)
    setClientsTab(next)
    setListPage(0)
    setAzDirectionFilter(AZ_DIRECTION_FILTER_ALL)
    if (next !== 'archive') setArchiveHallFilter(ARCHIVE_HALL_FILTER_ALL)
    if (next === 'archive' || next === 'tz' || next === 'az') {
      setQuickFilter('none')
    }
    patchListSearch((p) => {
      if (next === 'active') p.delete('clientsTab')
      else p.set('clientsTab', next)
      p.delete('list')
      if (next !== 'archive') p.delete('archiveHall')
      if (next === 'archive' || next === 'tz' || next === 'az') p.delete('filter')
    }, { resetPage: true })
  }

  const applyArchiveHallFilter = (id) => {
    const next = normalizeArchiveHallFilter(id)
    setArchiveHallFilter(next)
    setListPage(0)
    if (next === 'tz' || next === 'az') {
      setTrainerQuery('')
    }
    patchListSearch((p) => {
      if (!next) p.delete('archiveHall')
      else p.set('archiveHall', next)
      if (next === 'tz' || next === 'az') p.delete('trainer')
      p.delete('page')
    })
  }

  const applyAzDirectionFilter = (id) => {
    const next = normalizeAzDirectionFilterId(id)
    // Клик по направлению при поиске — выходим из cross-hall (как у воронки).
    if (crossHallSearch) {
      setQuery('')
      setAzDirectionFilter(next)
      setListPage(0)
      if (next && quickFilter === 'none') {
        setQuickFilter('all')
        patchListSearch((p) => {
          p.delete('q')
          p.set('filter', 'all')
          p.delete('page')
        }, { resetPage: true })
        return
      }
      patchListSearch((p) => {
        p.delete('q')
        p.delete('page')
      }, { resetPage: true })
      return
    }
    setAzDirectionFilter(next)
    setListPage(0)
    if (next && quickFilter === 'none') {
      setQuickFilter('all')
      patchListSearch((p) => {
        p.set('filter', 'all')
        p.delete('page')
      })
      return
    }
    patchListSearch((p) => {
      p.delete('page')
    })
  }

  const applyFilter = (id) => {
    const next = quickFilter === id ? 'none' : id
    // Клик по сводке при поиске — выходим из cross-hall, иначе эффект снова сбросит filter.
    if (crossHallSearch && next !== 'none') {
      setQuery('')
      setQuickFilter(next)
      setListPage(0)
      patchListSearch((p) => {
        p.delete('q')
        p.set('filter', next)
      }, { resetPage: true })
      return
    }
    setQuickFilter(next)
    setListPage(0)
    patchListSearch((p) => {
      if (next === 'none') p.delete('filter')
      else p.set('filter', next)
    }, { resetPage: true })
  }

  const onQueryChange = (value) => {
    setQuery(value)
    setListPage(0)
    patchListSearch((p) => {
      const v = String(value ?? '').trim()
      if (v) p.set('q', v)
      else p.delete('q')
    }, { resetPage: true })
  }

  const onTrainerQueryChange = (value) => {
    setTrainerQuery(value)
    setListPage(0)
    patchListSearch((p) => {
      const v = String(value ?? '').trim()
      if (v) p.set('trainer', v)
      else p.delete('trainer')
    }, { resetPage: true })
  }

  const restoreClientArchive = async (clientRow, hall = 'pz') => {
    if (!clientRow?.id) return
    setBusy(true)
    try {
      if (clientRow.archived_at) {
        const { warn } = await restoreClientFromClubArchive(clientRow)
        if (warn) alert(warn)
      } else {
        const { warn } = await reopenClientHall(clientRow, { hall: hall || 'pz' })
        if (warn) alert(warn)
      }
      await reload({ silent: true })
    } catch (err) {
      alert(err?.message ?? 'Не удалось вернуть клиента')
    } finally {
      setBusy(false)
    }
  }

  const confirmArchiveReason = async (payload) => {
    const modal = archiveReasonModal
    if (!modal?.client?.id) return
    setBusy(true)
    try {
      let warn = null
      if (modal.mode === 'enter') {
        if (modal.action === 'leave_club') {
          ;({ warn } = await leaveClubWithReason(modal.client, payload))
        } else {
          ;({ warn } = await closeClientHallWithReason(modal.client, payload, {
            hall: modal.hall || 'pz',
          }))
        }
      } else {
        ;({ warn } = await setClientArchiveReason(modal.client, payload))
      }
      if (warn) alert(warn)
      setArchiveReasonModal(null)
      await reload({ silent: true })
    } catch (err) {
      alert(err?.message ?? 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const trainerLabel = (tid) => {
    if (!tid) return '—'
    return trainerNameById[tid] ?? (String(tid).length > 10 ? `Тренер ${String(tid).slice(0, 8)}…` : tid)
  }

  const runDeleteClient = async () => {
    if (!confirmDelete?.id) return
    setDeleteBusy(true)
    try {
      await deleteClientAndAllData(confirmDelete.id)
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Удаление')
      if (warn) alert(warn)
      setConfirmDelete(null)
      await reload()
    } catch (e) {
      alert(e?.message ?? 'Не удалось удалить клиента')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section
      className={
        isSalesManager
          ? 'sales-clients sales-report sales-report--wide sales-report--manager'
          : 'admin-section-shell admin-section-shell--wide'
      }
    >
      {isSalesManager ? (
        <header className="sales-clients__topbar">
          <div className="sales-clients__topbar-text">
            <p className="sales-home__eyebrow">Клуб · день</p>
            <h1 className="sales-page__title">Клиенты</h1>
            <p className="sales-clients__lead">
              Те же фильтры, что у админа: ДР, воронки, ТЗ/АЗ, lite-ПЗ. Только ваш клуб.
            </p>
          </div>
          <div className="sales-clients__actions">
            <Link
              to={callLogHref}
              className="btn btn-ghost btn-sm btn-icon-square btn-touch"
              title="Журнал звонков клуба"
              aria-label="Журнал звонков клуба"
            >
              <Phone size={16} aria-hidden />
            </Link>
            <Link to="/sales" className="btn btn-ghost btn-sm btn-icon-square btn-touch" title="На главную" aria-label="На главную продаж">
              <ArrowLeft size={16} aria-hidden />
            </Link>
          </div>
        </header>
      ) : (
        <AdminSectionHeader
          icon={UserCircle}
          title="Клиенты"
          lead="ПЗ · ТЗ · АЗ · архив. Новый клиент — кнопка «+» (ПЗ lite / ТЗ / АЗ вручную). Массово ТЗ/АЗ — «Списки из Excel»."
        />
      )}

      {!club && clubBound ? (
        <p className="sales-clients__empty" role="status">
          Клуб не привязан к учётке. Обратитесь к администратору — без club_id список клиентов недоступен.
        </p>
      ) : null}

    <div className="grid stagger td-grid">
      <section className="card admin-clients-workspace" id="clients">
        <div className="admin-clients-workspace__toolbar">
          <div className="admin-clients-segment" role="tablist" aria-label="Зал: ПЗ, ТЗ, АЗ или архив">
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'active'}
              onClick={() => switchClientsTab('active')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.active}
              <span className="admin-clients-segment__count">
                {lifecycleReady ? listTabCounts.active : '…'}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'tz'}
              onClick={() => switchClientsTab('tz')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.tz}
              <span className="admin-clients-segment__count">
                {lifecycleReady ? listTabCounts.tz : '…'}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'az'}
              onClick={() => switchClientsTab('az')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.az}
              <span className="admin-clients-segment__count">
                {lifecycleReady ? listTabCounts.az : '…'}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'archive'}
              onClick={() => switchClientsTab('archive')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.archive}
              <span className="admin-clients-segment__count">
                {lifecycleReady ? listTabCounts.archive : '…'}
              </span>
            </button>
          </div>
          <div className="admin-clients-workspace__actions">
            {clientsTab !== 'archive' ? (
              <button
                type="button"
                className="btn btn-secondary btn-icon-square btn-touch"
                disabled={busy}
                onClick={() => setClientCreateOpen(true)}
                aria-label="Новый клиент"
                title="Новый клиент ПЗ, ТЗ или АЗ"
              >
                <UserPlus size={20} aria-hidden />
              </button>
            ) : null}
            <Link
              to={callLogHref}
              className="btn btn-ghost btn-icon-square btn-touch"
              title="Журнал звонков клуба"
              aria-label="Журнал звонков клуба"
            >
              <Phone size={20} aria-hidden />
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-icon-square btn-touch"
              disabled={busy}
              onClick={() => void refreshFromCloud()}
              aria-label="Обновить список из облака"
              title="Обновить из Supabase"
            >
              <RefreshCw size={20} className={busy ? 'icon-spin' : undefined} aria-hidden />
            </button>
          </div>
        </div>

        {refreshMsg ? (
          <p className="sync-feedback sync-feedback--ok admin-clients-workspace__note">{refreshMsg}</p>
        ) : null}
        {smsFeedback ? (
          <p
            className={`sync-feedback admin-clients-workspace__note${
              smsFeedback.tone === 'warn'
                ? ' sync-feedback--warn'
                : smsFeedback.tone === 'err'
                  ? ' sync-feedback--err'
                  : ' sync-feedback--ok'
            }`}
            role="status"
          >
            {smsFeedback.msg}
          </p>
        ) : null}
        {cloudNeedsClub && !clubBound ? (
          <p className="muted admin-clients-workspace__note">
            В облачном режиме выберите <strong>клуб</strong> в панели выше — иначе список клиентов не загружается.
          </p>
        ) : cloudNeedsClub && clubBound && club ? (
          <p className="muted admin-clients-workspace__note">
            Не удалось подтянуть список из облака — показан локальный кэш. Нажмите обновить.
          </p>
        ) : !cloudNeedsClub ? (
          <p className="muted admin-clients-workspace__meta">
            {source === 'remote' || source === 'admin_api' ? (
              <>Данные из <strong>Supabase</strong>{source === 'admin_api' ? ' (через сервер приложения)' : ''}</>
            ) : (
              <>
                С <strong>устройства</strong> (IndexedDB).
                {!club ? (clubBound ? ' Нужен club_id в профиле.' : ' Выберите клуб в шапке.') : null}
              </>
            )}
          </p>
        ) : null}
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
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          {!showTrainerSearch ? null : (
            <div className="admin-clients-search-cell">
              <UserSearch size={18} aria-hidden className="muted u-shrink-0" />
              <input
                className="admin-clients-search-input"
                type="search"
                autoComplete="off"
                placeholder="Тренер: ФИО…"
                aria-label="Поиск по закреплённому тренеру"
                value={trainerQuery}
                onChange={(e) => onTrainerQueryChange(e.target.value)}
              />
            </div>
          )}
        </div>
        {crossHallSearch ? (
          <p className="muted admin-inline-note" role="status" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {adminClientsCrossHallSearchNote()}
          </p>
        ) : null}

        {clientsTab === 'active' || isDeskHallTab ? (
          <>
            <AdminClientsBrowseFilters
              counts={filterCounts}
              quickFilter={quickFilter}
              onApply={applyFilter}
              hidePnk={isDeskHallTab}
              allLabel={allTileLabel}
              mutedBySearch={crossHallSearch}
              countsPending={!lifecycleReady}
            />
            {clientsTab === 'az' ? (
              <AdminClientsAzDirectionFilters
                options={azDirectionOptions}
                value={crossHallSearch ? AZ_DIRECTION_FILTER_ALL : azDirectionFilter}
                onChange={applyAzDirectionFilter}
                mutedBySearch={crossHallSearch}
              />
            ) : null}
            {isDeskHallTab ? (
              <p className="admin-clients-workspace__archive-hint muted">
                Вкладка {clientsTab === 'tz' ? 'ТЗ' : 'АЗ'}: люди из списка заканчивающихся, без живого тренера.
                Карточка — контакты и абонементы. Загрузка файла — в «Списки из Excel».
                {clientsTab === 'az'
                  ? ' Направления — типы абон. АЗ. Списание занятий — кнопка рядом с профилем (и в карточке); журнал дат — в абонементе.'
                  : ''}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <AdminClientsArchiveHallFilters
              options={archiveHallOptions}
              value={archiveHallFilter}
              onChange={applyArchiveHallFilter}
            />
            <p className="admin-clients-workspace__archive-hint muted">
              Архивные карточки: просмотр и возврат. Подвкладки — тот же зал, что у живых ПЗ/ТЗ/АЗ.
              {archiveHallFilter
                ? ` Сейчас: ${ARCHIVE_HALL_FILTER_LABELS[archiveHallFilter] || archiveHallFilter}.`
                : ''}{' '}
              Поиск по имени, телефону
              {showTrainerSearch ? ' или тренеру' : ''} — от 2 символов.{' '}
              {isSupervisor ? null : (
                <>
                  <Link
                    to={
                      isSalesManager
                        ? '/sales/deletion-log'
                        : `/admin/deletion-log${club ? `?club=${encodeURIComponent(club)}` : ''}`
                    }
                  >
                    Журнал удалений
                  </Link>
                  {' '}
                  — кто стёр карточку совсем (не архив).
                </>
              )}
            </p>
          </>
        )}

        <div className="admin-clients-workspace__results">
          {showClientList && resultsShown ? (
            <div className="admin-clients-results-bar">
              <span className="admin-clients-results-bar__label">
                Показано: <strong>{resultsShown.title}</strong>
                {resultsShown.detail ? (
                  <span className="muted"> ({resultsShown.detail})</span>
                ) : null}
                {resultsShown.suffix ? <span className="muted">{resultsShown.suffix}</span> : null}
              </span>
              {resultsShown.clearBrowse ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-touch admin-clients-results-bar__clear"
                  onClick={clearBrowseFilter}
                >
                  Сбросить
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-touch admin-clients-results-bar__clear"
                  onClick={() => {
                    setQuery('')
                    setListPage(0)
                    patchListSearch((p) => {
                      p.delete('q')
                    }, { resetPage: true })
                  }}
                >
                  Очистить поиск
                </button>
              )}
            </div>
          ) : null}

          {!cloudNeedsClub && showClientList ? (
            <AdminClubSmsCampaignBar
              active={smsCampaign.active}
              configured={clubSmsConfigured}
              selectedCount={smsCampaign.selectedCount}
              eligibleCount={smsCampaign.eligibleCount}
              skippedNoPhone={smsCampaign.skippedNoPhone}
              running={smsCampaign.running}
              progressLabel={smsCampaign.progressLabel}
              onEnter={smsCampaign.enter}
              onExit={smsCampaign.exit}
              onSelectAll={smsCampaign.selectAll}
              onClear={smsCampaign.clearSelection}
              onCompose={smsCampaign.openCompose}
              onCancelRun={smsCampaign.cancelRun}
            />
          ) : null}

          {!cloudNeedsClub && !showClientList ? (
            <div className="admin-clients-empty" role="status">
              <Search size={28} aria-hidden className="admin-clients-empty__icon" />
              <p className="admin-clients-empty__title">Список скрыт</p>
              <p className="muted admin-clients-empty__text">
                {isDeskHallTab
                  ? 'Выберите карточку сводки или введите поиск от 2 символов. Загрузка файла — в «Списки из Excel».'
                  : `Введите поиск от 2 символов, нажмите карточку сводки${clientsTab === 'active' ? '' : ' или оставайтесь в архиве'} — тогда появятся карточки клиентов.`}
              </p>
            </div>
          ) : null}

          {!cloudNeedsClub && showClientList && filteredClients.length === 0 ? (
            <div className="admin-clients-empty admin-clients-empty--compact" role="status">
              <p className="muted admin-clients-empty__text" style={{ margin: 0 }}>
                {clients.length === 0
                  ? 'Нет клиентов по выбранным условиям.'
                  : quickFilter === 'birthdays'
                    ? `Нет дней рождения сегодня и в ближайшие ${BIRTHDAY_WINDOW_DAYS} дней (проверьте дату в карточке).`
                    : 'Никто не подходит под фильтр или поиск.'}
              </p>
            </div>
          ) : null}

          {!cloudNeedsClub && showClientList && filteredClients.length > 0 ? (
          <ul className="list admin-clients-list">
            {pagedListItems.map((item) => {
              if (item.type === 'section') {
                return (
                  <BirthdayBrowseSectionHeader
                    key={`bd-sec-${item.key}`}
                    title={item.title}
                    count={item.count}
                  />
                )
              }
              const c = item.client
              return (
                <AdminClientsListRow
                  key={c.id}
                  client={c}
                  clientsTab={clientsTab}
                  crossHallSearch={crossHallSearch}
                  today={today}
                  memByClient={memByClient}
                  pageTrainings={pageTrainings}
                  pageTrainingsBusy={pageTrainingsBusy}
                  lastTrainingByClient={lastTrainingByClient}
                  todaySnapshot={todaySnapshot}
                  quickFilter={quickFilter}
                  noTabletTrainerIds={noTabletTrainerIds}
                  smsMode={smsMode}
                  trainerNameById={trainerNameById}
                  lifecycleRows={lifecycleRows}
                  membershipTypes={membershipTypes}
                  azMembershipTypes={azMembershipTypes}
                  loyaltyGlanceById={loyaltyGlanceById}
                  smsCampaign={smsCampaign}
                  club={club}
                  clubSmsClubName={clubSmsClubName}
                  clubSmsTemplates={clubSmsTemplates}
                  clubSmsConfigured={clubSmsConfigured}
                  clubSmsMarkByClient={clubSmsMarkByClient}
                  viewingSmsFilter={viewingSmsFilter}
                  busy={busy}
                  onSmsFeedback={onSmsFeedback}
                  onClubSmsSent={onClubSmsSent}
                  clientsBasePath={clientsBasePath}
                  listNavState={listNavState}
                  cardHrefForClient={cardHrefForClient}
                  trainerLabel={trainerLabel}
                  isSalesManager={isSalesManager}
                  onOpenCallHistory={setCallHistoryClient}
                  onArchiveReasonModal={setArchiveReasonModal}
                  onRestoreArchive={restoreClientArchive}
                  onConfirmDelete={setConfirmDelete}
                  onReloadSilent={() => void reload({ silent: true })}
                  onToast={(msg) => setRefreshMsg(msg)}
                />
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
                onClick={() => goListPage(listPage - 1)}
              >
                Назад
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                disabled={listPage >= totalPages - 1 || busy}
                onClick={() => goListPage(listPage + 1)}
              >
                Вперёд
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </section>

      <AdminClientCallHistorySheet
        open={Boolean(callHistoryClient)}
        onClose={() => setCallHistoryClient(null)}
        clubId={club}
        client={callHistoryClient}
        clubName={clubSmsClubName}
        configured={clubSmsConfigured}
        reloadToken={callHistTick}
        onFeedback={onSmsFeedback}
        onCalled={() => setCallHistTick((n) => n + 1)}
        onNoteSaved={() => setCallHistTick((n) => n + 1)}
      />

      <AdminClubSmsCampaignComposeSheet
        open={smsCampaign.composeOpen}
        clubName={clubSmsClubName}
        scenarioLabel={smsCampaign.scenarioLabel}
        initialText={smsCampaign.draftText}
        recipients={smsCampaign.recipients}
        onClose={smsCampaign.closeCompose}
        onContinue={smsCampaign.continueToConfirm}
      />

      <AdminClubSmsCampaignConfirmModal
        open={smsCampaign.confirmOpen}
        busy={smsCampaign.running}
        clubName={clubSmsClubName}
        recipients={smsCampaign.recipients}
        text={smsCampaign.draftText}
        onCancel={smsCampaign.closeConfirm}
        onConfirm={() => void smsCampaign.launch()}
      />

      <AdminClubSmsCampaignResultModal
        open={smsCampaign.resultOpen}
        result={smsCampaign.lastResult}
        recipientsCount={smsCampaign.resultRecipientsCount}
        onClose={smsCampaign.closeResult}
        onOpenJournal={() => {
          smsCampaign.closeResult()
          setSmsJournalOpen(true)
        }}
      />

      {smsJournalOpen && club ? (
        <div
          className="modal-overlay club-sms-campaign-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Журнал SMS клуба"
          onClick={() => setSmsJournalOpen(false)}
        >
          <div
            className="modal-panel club-sms-campaign-modal"
            style={{ maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => setSmsJournalOpen(false)}
              >
                Закрыть
              </button>
            </div>
            <AdminClubSmsJournalSection clubId={club} />
          </div>
        </div>
      ) : null}

      <ClientHardDeleteConfirmModal
        open={Boolean(confirmDelete)}
        clientName={confirmDelete?.name}
        busy={deleteBusy}
        aria-labelledby="adm-delete-client-title"
        onCancel={() => !deleteBusy && setConfirmDelete(null)}
        onConfirm={() => void runDeleteClient()}
      />

      <ClientArchiveReasonModal
        open={Boolean(archiveReasonModal)}
        mode={archiveReasonModal?.mode === 'edit' ? 'edit' : 'enter'}
        clientName={archiveReasonModal?.client?.name}
        client={archiveReasonModal?.client}
        initialReason={archiveReasonModal?.mode === 'edit' ? archiveReasonModal?.client?.archive_reason : null}
        busy={busy}
        {...adminClientsCloseHallModalCopy(archiveReasonModal?.hall || 'pz', {
          leaveClub: archiveReasonModal?.action === 'leave_club',
        })}
        onCancel={() => !busy && setArchiveReasonModal(null)}
        onConfirm={(payload) => void confirmArchiveReason(payload)}
      />

      {clientCreateOpen ? (
        <AdminClientCreateModal
          key={`create-${manualCreateHallFromClientsTab(clientsTab) || 'pz'}`}
          open
          defaultHall={manualCreateHallFromClientsTab(clientsTab) || 'pz'}
          clubId={club}
          trainers={trainersForClub}
          azTypes={
            azMembershipTypes.length > 0 ? azMembershipTypes : filterAerobicSalesTypes(membershipTypes)
          }
          organizationHref={
            isSalesManager || isSupervisor
              ? ''
              : `/admin/structure?tab=trainers${club ? `&club=${encodeURIComponent(club)}` : ''}`
          }
          onClose={() => setClientCreateOpen(false)}
        onCreated={(clientId, hall) => {
          const nextTab = hall === 'tz' ? 'tz' : hall === 'az' ? 'az' : 'active'
          const nextHall = hall === 'tz' || hall === 'az' || hall === 'pz' ? hall : 'pz'
          if (clientsTab !== nextTab) switchClientsTab(nextTab)
          void reload().then(() => {
            if (!clientId) return
            navigate(
              buildAdminClientCardHref(clientsBasePath, clientId, {
                clubId: clubBound ? '' : club,
                clientsTab: nextTab,
                filter: 'none',
                page: 1,
                hall: nextHall,
              }),
            )
          })
        }}
        />
      ) : null}
    </div>
    </section>
  )
}
