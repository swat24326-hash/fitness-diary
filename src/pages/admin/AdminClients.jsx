import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { Archive, ArrowLeft, History, Phone, Pencil, RefreshCw, RotateCcw, Search, Trash2, UserCircle, UserPlus, UserSearch } from 'lucide-react'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
import { AdminClientClubSmsButton } from '../../components/admin/AdminClientClubSmsButton.jsx'
import { AdminClientClubCallButton } from '../../components/admin/AdminClientClubCallButton.jsx'
import { AdminClientCallHistorySheet } from '../../components/admin/AdminClientCallHistorySheet.jsx'
import { AdminClubSmsCampaignBar } from '../../components/admin/AdminClubSmsCampaignBar.jsx'
import { AdminClubSmsCampaignComposeSheet } from '../../components/admin/AdminClubSmsCampaignComposeSheet.jsx'
import { AdminClubSmsCampaignConfirmModal } from '../../components/admin/AdminClubSmsCampaignConfirmModal.jsx'
import { AdminClubSmsCampaignResultModal } from '../../components/admin/AdminClubSmsCampaignResultModal.jsx'
import { AdminClubSmsCampaignRowCheck } from '../../components/admin/AdminClubSmsCampaignRowCheck.jsx'
import { AdminClubSmsJournalSection } from '../../components/admin/AdminClubSmsJournalSection.jsx'
import { AdminClientMaxButton } from '../../components/admin/AdminClientMaxButton.jsx'
import { LoyaltyGlanceChip } from '../../components/loyalty/LoyaltyGlanceChip.jsx'
import { useLoyaltyGlanceMap } from '../../hooks/useLoyaltyGlanceMap.js'
import { useAdminClubSmsCampaign } from './useAdminClubSmsCampaign.js'
import { AdminClientsBrowseFilters } from '../../components/admin/AdminClientsBrowseFilters.jsx'
import { AdminClientsAzDirectionFilters } from '../../components/admin/AdminClientsAzDirectionFilters.jsx'
import { AdminClientsArchiveHallFilters } from '../../components/admin/AdminClientsArchiveHallFilters.jsx'
import { AdminDeskAzDeductButton } from '../../components/admin/AdminDeskAzDeductButton.jsx'
import { ClientRowMoreMenu } from '../../components/ClientRowMoreMenu.jsx'
import {
  deleteClientAndAllData,
  dispatchLocalDataChanged,
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
  formatDeskAzSessionUsageRu,
  pickAzMembershipForDeduct,
} from '../../lib/admin/deskAzSessionDeductCore.js'
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
  formatUpcomingBirthdayLabel,
  partitionBirthdayBrowseClients,
  sortClientsForBirthdayBrowse,
  withBirthdayBrowseSectionBreaks,
} from '../../lib/clientBirthdays.js'
import { isBirthdayToday } from '../../lib/trainer/trainerClientOutreachCore.js'
import { BirthdayBrowseSectionHeader } from '../../components/clients/BirthdayBrowseSectionHeader.jsx'
import { loadAdminClubMembershipsMap, loadAdminClubTrainingsForClientIds } from '../../lib/admin/adminClubWorkspaceCache'
import { fetchClientsLastTrainingsViaApi } from '../../lib/admin/adminApiClient'
import { fetchClubSmsStatus, fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import { listRecentClubSmsLogs } from '../../lib/admin/clubSmsLogService.js'
import {
  clubSmsMarkChipLabel,
  clubSmsMarkTitle,
  mapClubSmsMarksByClient,
  resolveClientClubSmsScenario,
} from '../../lib/admin/clubSmsSentMarkCore.js'
import { resolveClubSmsMode } from '../../lib/admin/clubSmsModeCore.js'
import { peekAdminClientsListLocal, pullAdminClientsFromCloud } from '../../lib/admin/adminClientsListService'
import { buildClientCardNavSeed } from '../../lib/admin/clientWorkspaceScopeCore.js'
import {
  invalidateAdminClientsListMemory,
  peekAdminClientsListMemory,
  writeAdminClientsListMemory,
} from '../../lib/admin/adminClientsListMemoryCache.js'
import { useDebouncedStorageReload, shouldReloadAdminClientsPage } from '../../lib/useDebouncedStorageReload'
import { ADMIN_CLIENTS_PAGE_SIZE, ADMIN_CLIENTS_REMOTE_LIMIT } from '../../lib/admin/adminConstants'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
} from '../../lib/syncService'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import {
  countedUsedTrainingsOnMembership,
  formatInactiveClientListLabel,
  membershipUsageLabel,
} from '../../lib/membershipRules'
import { filterMembershipsByHall } from '../../lib/membershipHallCore.js'
import {
  pickExpiredMembershipWithRemaining,
} from '../../lib/clientListSignals'
import {
  deskAzDirectionLabel,
  formatDeskPackageDurationLabel,
  hallMembershipListSignal,
  inferDeskPackageDuration,
  pickHallActiveMembership,
} from '../../lib/admin/deskMembershipLedgerCore.js'
import {
  buildClientHallStack,
  clientMatchesAdminSearchQuery,
  resolveAdminClientsSearchPool,
  resolveCrossHallSearchFactHall,
  shouldSearchAcrossHalls,
} from '../../lib/admin/adminClientsCrossHallSearchCore.js'
import { AdminClientHallStack } from '../../components/admin/AdminClientHallStack.jsx'
import {
  buildAdminClientCardHref,
  parseAdminClientsListPage,
} from '../../lib/admin/adminClientsListHrefCore.js'
import {
  ADMIN_CLIENTS_LIST_TAB_LABELS,
  clientDeskHall,
  countClientsByAdminListTab,
  filterClientsByAdminListTab,
  normalizeAdminClientsListTab,
} from '../../lib/admin/deskHallClientsCore.js'
import { collectNoTabletTrainerIds, isLitePzClient } from '../../lib/admin/trainerTabletModeCore.js'
import { collectHoldingTrainerIds } from '../../lib/admin/holdingClientsCore.js'
import { canSalesManagerHardDeleteClient } from '../../lib/admin/salesManagerClientsAccessCore.js'
import { ClientHardDeleteConfirmModal } from '../../components/ClientHardDeleteConfirmModal.jsx'
import { ClientArchiveReasonModal } from '../../components/ClientArchiveReasonModal.jsx'
import { ClientArchiveReasonFact } from '../../components/ClientArchiveReasonFact.jsx'
import { ClientArchiveReasonEditButton } from '../../components/ClientArchiveReasonEditButton.jsx'
import { setClientArchiveReason } from '../../lib/clientArchiveSyncService.js'
import {
  closeClientHallWithReason,
  leaveClubWithReason,
  reopenClientHall,
  restoreClientFromClubArchive,
} from '../../lib/clientHallLifecycleSyncService.js'
import {
  adminClientsCloseHallLabel,
  adminClientsCloseHallModalCopy,
  adminClientsReopenHallLabel,
  resolveAdminClientsActionHall,
  shouldOfferAdminCloseHall,
  shouldOfferAdminReopenHall,
} from '../../lib/admin/adminClientsHallLifecycleMenuCore.js'
import { getDb } from '../../lib/localDb.js'
import { clientNeedsArchiveReason } from '../../lib/clientArchiveReasonCore.js'
import { AdminClientListAbonFact } from '../../components/admin/AdminClientListAbonFact.jsx'
import { AdminClientCreateModal } from '../../components/admin/AdminClientCreateModal.jsx'
import { manualCreateHallFromClientsTab } from '../../lib/admin/deskManualClientCreateCore.js'
import { filterAerobicSalesTypes } from '../../lib/membershipTypesCore.js'
import { ensureMembershipTypesForClub } from '../../lib/membershipTypesService.js'
import { resolveClientListMembershipTypeCode } from '../../lib/admin/clientListMembershipTypeCore.js'
import '../../styles/pnk-funnel.css'
import '../../styles/sales-clients.css'

function lastTrainingDateFromMap(map, clientId, loading) {
  const id = String(clientId ?? '')
  if (map && Object.prototype.hasOwnProperty.call(map, id)) {
    const d = map[id]
    return d ? formatDateRu(d) : '—'
  }
  return loading ? '…' : '—'
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
  const [smsFeedback, setSmsFeedback] = useState(null)
  const [azMembershipTypes, setAzMembershipTypes] = useState([])
  const [membershipTypes, setMembershipTypes] = useState([])
  const [azDirectionFilter, setAzDirectionFilter] = useState(AZ_DIRECTION_FILTER_ALL)
  const [clubSmsConfigured, setClubSmsConfigured] = useState(null)
  const [clubSmsTemplates, setClubSmsTemplates] = useState(null)
  const [clubSmsClubName, setClubSmsClubName] = useState('')
  /** @type {[object[], function]} */
  const [clubSmsLogs, setClubSmsLogs] = useState([])
  /** Не сбрасывать page из URL, пока список ещё не подгрузился. */
  const [listReady, setListReady] = useState(false)

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

  const onSmsFeedback = useCallback((msg, tone = 'ok', opts = {}) => {
    setSmsFeedback({ msg, tone })
    const ms = Number(opts?.durationMs) > 0 ? Number(opts.durationMs) : 4000
    window.setTimeout(() => setSmsFeedback(null), ms)
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
      status: 'ok',
      created_at: new Date().toISOString(),
    }
    setClubSmsLogs((prev) => [...prev, entry])
  }, [club])

  const refreshClubSmsLogsFromCloud = useCallback(async () => {
    if (!club) return
    try {
      const cloud = await fetchClubSmsLogs(club, { sinceDays: 14 })
      if (Array.isArray(cloud)) {
        setClubSmsLogs(cloud)
        return
      }
    } catch {
      /* оставим локальный кэш */
    }
    try {
      const local = await listRecentClubSmsLogs(club, { todayIso: todayLocalIso() })
      setClubSmsLogs(local)
    } catch {
      /* ignore */
    }
  }, [club])

  const [smsJournalOpen, setSmsJournalOpen] = useState(false)

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBusy(true)
    try {
      // Фаза 0: память (синхронно по смыслу — мгновенный «назад»).
      if (club) {
        const mem = peekAdminClientsListMemory(club)
        if (mem?.clients?.length) {
          setClients(mem.clients)
          setMemByClient(mem.memByClient ?? {})
          setTrainerNameById(mem.trainerNameById ?? {})
          setNoTabletTrainerIds(new Set(mem.noTabletTrainerIds ?? []))
          setHoldingTrainerIds(new Set(mem.holdingTrainerIds ?? []))
          setListTruncated(!!mem.truncated)
          setSource(mem.source || 'local')
          setFallback(null)
          setCloudNeedsClub(false)
          setListReady(true)
          if (!silent) setBusy(false)
        }
      }

      // Фаза 1: IndexedDB.
      if (club) {
        try {
          const [peek, trainersPeek] = await Promise.all([
            peekAdminClientsListLocal(club),
            listTrainerSummariesForAdmin(),
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
            const mapPeek = await loadAdminClubMembershipsMap(club)
            setMemByClient(mapPeek)
            writeAdminClientsListMemory(club, {
              clients: peek.clients,
              memByClient: mapPeek,
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

      const [{ clients: list, source: src, fallbackReason, cloudNeedsClub: need, truncated: trunc }, trainers] =
        await Promise.all([
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
      setClients(arr)
      try {
        const db = await getDb()
        if (db.objectStoreNames.contains('client_hall_lifecycle')) {
          const life = await db.getAll('client_hall_lifecycle')
          const clubId = String(club ?? '').trim()
          setLifecycleRows(
            clubId
              ? (life ?? []).filter((r) => String(r?.club_id ?? '') === clubId)
              : life ?? [],
          )
        } else {
          setLifecycleRows([])
        }
      } catch {
        setLifecycleRows([])
      }
      // Не сбрасываем lastTrainingByClient — иначе колонка «Последняя» мигает «—» на каждой перезагрузке.
      setPageTrainings([])

      const map = club ? await loadAdminClubMembershipsMap(club) : {}
      setMemByClient(map)
      if (club && arr.length) {
        writeAdminClientsListMemory(club, {
          clients: arr,
          memByClient: map,
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
      setLastTrainingByClient({})
      setPageTrainings([])
      setTrainerNameById({})
      setSource('local')
      setFallback(null)
      setCloudNeedsClub(false)
      setListTruncated(false)
      if (club) invalidateAdminClientsListMemory(club)
    } finally {
      setListReady(true)
      if (!silent) setBusy(false)
    }
  }, [club, clubBound])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => reload({ silent: true }), { shouldRun: shouldReloadAdminClientsPage })

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

  const today = todayLocalIso()

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

  const listTabCounts = useMemo(
    () => countClientsByAdminListTab(clients, memByClient),
    [clients, memByClient],
  )
  const isDeskHallTab = clientsTab === 'tz' || clientsTab === 'az'
  const archiveHallOptions = useMemo(
    () => (clientsTab === 'archive' ? buildArchiveHallFilterOptions(clients, memByClient) : []),
    [clientsTab, clients, memByClient],
  )
  const showTrainerSearch =
    !isDeskHallTab &&
    !(clientsTab === 'archive' && (archiveHallFilter === 'tz' || archiveHallFilter === 'az'))

  const crossHallSearch = shouldSearchAcrossHalls(query, clientsTab)

  // Cross-hall поиск: сбрасываем воронку — иначе chip≠list и hallMode врёт.
  useEffect(() => {
    if (!crossHallSearch) return
    if (quickFilter === 'none') return
    setQuickFilter('none')
    setListPage(0)
    patchListSearch((p) => {
      p.delete('filter')
    }, { resetPage: true })
  }, [crossHallSearch]) // сброс воронки только при входе в cross-hall поиск

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const tq = trainerQuery.trim().toLowerCase()

    let base = resolveAdminClientsSearchPool({
      clients,
      clientsTab,
      query,
      memByClient,
      filterByTab: filterClientsByAdminListTab,
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

    // Воронка только без cross-hall и не на Архиве (иначе archive∩active = пусто).
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
        clientMatchesAzDirectionFilter(memByClient[c.id] ?? [], azDirectionFilter, today),
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
  ])

  const azDirectionOptions = useMemo(() => {
    if (clientsTab !== 'az') return []
    const q = query.trim().toLowerCase()
    let pool = filterClientsByAdminListTab(clients, 'az', memByClient)
    if (q) {
      pool = pool.filter((c) => {
        const name = String(c.name ?? '').toLowerCase()
        const phone = String(c.phone ?? '').toLowerCase()
        const card = String(c.card_number ?? '').toLowerCase()
        return name.includes(q) || phone.includes(q) || card.includes(q)
      })
    }
    return buildAzDirectionFilterOptions({
      clients: pool,
      memByClient,
      azTypes: azMembershipTypes,
      todayIso: today,
    })
  }, [clientsTab, clients, query, memByClient, azMembershipTypes, today])

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
        if (needDates && !Object.keys(map).length) {
          const fromIdb = buildLastTrainingMap(rows)
          for (const id of missing) {
            map[id] = fromIdb[id] ? String(fromIdb[id]).slice(0, 10) : ''
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

  const filterCounts = useMemo(
    () =>
      buildAdminClientsBrowseCounts({
        clients,
        memByClient,
        clientsTab,
        today,
        azDirectionFilter: clientsTab === 'az' ? azDirectionFilter : '',
        lifecycleRows,
      }),
    [clients, clientsTab, memByClient, today, azDirectionFilter, lifecycleRows],
  )

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
      dispatchLocalDataChanged({ reason: 'client-archive-changed', clientId: clientRow.id })
      if (club) invalidateAdminClientsListMemory(club)
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
      const cid = modal.client.id
      setArchiveReasonModal(null)
      dispatchLocalDataChanged({ reason: 'client-archive-changed', clientId: cid })
      if (club) invalidateAdminClientsListMemory(club)
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
      if (club) invalidateAdminClientsListMemory(club)
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
              <span className="admin-clients-segment__count">{listTabCounts.active}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'tz'}
              onClick={() => switchClientsTab('tz')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.tz}
              <span className="admin-clients-segment__count">{listTabCounts.tz}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'az'}
              onClick={() => switchClientsTab('az')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.az}
              <span className="admin-clients-segment__count">{listTabCounts.az}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="admin-clients-segment__btn"
              aria-selected={clientsTab === 'archive'}
              onClick={() => switchClientsTab('archive')}
            >
              {ADMIN_CLIENTS_LIST_TAB_LABELS.archive}
              <span className="admin-clients-segment__count">{listTabCounts.archive}</span>
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
            />
            {clientsTab === 'az' ? (
              <AdminClientsAzDirectionFilters
                options={azDirectionOptions}
                value={azDirectionFilter}
                onChange={applyAzDirectionFilter}
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
              const mlistAll = memByClient[c.id] ?? []
              const tabHall =
                clientsTab === 'tz' ? 'tz' : clientsTab === 'az' ? 'az' : clientsTab === 'active' ? 'pz' : null
              const hall = tabHall || clientDeskHall(c)
              const mlist = hall ? filterMembershipsByHall(mlistAll, hall, c) : mlistAll
              const clientTrainings = pageTrainings.filter((t) => t.client_id === c.id)
              const isDeskClient = hall === 'tz' || hall === 'az'
              const isTzDesk = hall === 'tz'
              const active = pickHallActiveMembership(mlistAll, today, hall)
              const sig = hallMembershipListSignal(mlistAll, today, hall)
              const expiredLeft =
                active || isTzDesk ? null : pickExpiredMembershipWithRemaining(mlist, today)
              const deskMemForPkg =
                active ||
                (isDeskClient && mlist.length
                  ? [...mlist].sort((a, b) =>
                      String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')),
                    )[0]
                  : null)
              const deskPkg = deskMemForPkg
                ? formatDeskPackageDurationLabel(
                    inferDeskPackageDuration(deskMemForPkg.start_date, deskMemForPkg.end_date),
                  )
                : null
              const azDeductMem =
                hall === 'az' ? pickAzMembershipForDeduct(mlist, today) || deskMemForPkg : null
              const last = lastTrainingDateFromMap(lastTrainingByClient, c.id, pageTrainingsBusy)
              const inactiveRow = todaySnapshot.inactiveDetailById.get(c.id)
              const inactiveLabel =
                quickFilter === 'inactive' &&
                inactiveRow &&
                clientsTab !== 'tz' &&
                clientsTab !== 'az'
                  ? formatInactiveClientListLabel(inactiveRow)
                  : ''
              const isLiteRow = isLitePzClient(c, noTabletTrainerIds)
              const birthdayLabel =
                quickFilter === 'birthdays' ? formatUpcomingBirthdayLabel(c.birth_date, today) : null
              const birthdayIsToday = quickFilter === 'birthdays' && isBirthdayToday(c.birth_date, today)
              const rowSmsMode =
                quickFilter === 'birthdays' && !birthdayIsToday
                  ? { mode: 'custom', scenario: null, label: 'Свой текст' }
                  : smsMode
              const hallStack = crossHallSearch
                ? buildClientHallStack(c, mlistAll, {
                    today,
                    trainerName: trainerNameById[String(c.trainer_id ?? '')] || '',
                  })
                : []
              /** В cross-hall поиске факты абона — по первому залу стека (обычно ПЗ), иначе как у вкладки. */
              const factHall = crossHallSearch
                ? resolveCrossHallSearchFactHall(hallStack, hall)
                : hall
              const factMlist = factHall
                ? filterMembershipsByHall(mlistAll, factHall, c)
                : mlistAll
              const factActive = pickHallActiveMembership(mlistAll, today, factHall || null)
              const factSig = hallMembershipListSignal(mlistAll, today, factHall || null)
              const factIsDesk = factHall === 'tz' || factHall === 'az'
              const factExpiredLeft =
                factActive || factHall === 'tz'
                  ? null
                  : pickExpiredMembershipWithRemaining(factMlist, today)
              const abonTypeCode = resolveClientListMembershipTypeCode(
                {
                  active: factActive,
                  expiredLeft: factExpiredLeft,
                  memList: factMlist,
                  todayIso: today,
                },
                membershipTypes,
              )
              const cardNavSeed = { clientSeed: buildClientCardNavSeed(c) }
              const campaignNoPhone = smsCampaign.active && !smsCampaign.rowSelectable(c)
              return (
                <li key={c.id} className="list-item td-client-item">
                  <div className="td-client-card">
                    <div className="td-client-card__top">
                      {smsCampaign.active ? (
                        <AdminClubSmsCampaignRowCheck
                          clientId={c.id}
                          clientName={formatClientName(c.name) || c.name}
                          checked={smsCampaign.isSelected(c.id)}
                          disabled={smsCampaign.running}
                          noPhone={campaignNoPhone}
                          onChange={smsCampaign.toggle}
                        />
                      ) : null}
                      <div className="td-client-card__who">
                        <span title={sig.label} className="td-client-dot" style={{ background: sig.color }} />
                        <div className="td-client-card__who-text">
                          <strong className="td-client-card__name">
                            {formatClientName(c.name) || c.name}
                            {isLiteRow ? (
                              <span
                                className="pnk-badge"
                                style={{ marginLeft: 8 }}
                                title="Тренер без планшета — карточку ведёт админ (карта и абон), не полный дневник"
                              >
                                ведёт админ
                              </span>
                            ) : null}
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
                        {crossHallSearch ? (
                          <>
                            {!factIsDesk ? (
                              <div className="td-client-fact">
                                <span className="td-client-fact__label">Тренер</span>
                                <span className="td-client-fact__value">{trainerLabel(c.trainer_id)}</span>
                              </div>
                            ) : null}
                            <AdminClientListAbonFact typeCode={abonTypeCode}>
                              {factIsDesk ? (
                                factActive ? (
                                  <>до {formatDateRu(factActive.end_date)}</>
                                ) : (
                                  factSig.factLabel || 'нет абонемента'
                                )
                              ) : factActive ? (
                                <>
                                  до {formatDateRu(factActive.end_date)}
                                  <span className="td-client-fact__sub">
                                    {' '}
                                    · {membershipUsageLabel(factActive, clientTrainings)}
                                  </span>
                                </>
                              ) : factExpiredLeft ? (
                                <>
                                  срок {formatDateRu(factExpiredLeft.end_date)}
                                  <span className="td-client-fact__sub">
                                    {' '}
                                    · осталось{' '}
                                    {remainingTrainingsOnMembership(factExpiredLeft, clientTrainings) ?? '—'}
                                  </span>
                                </>
                              ) : (
                                factSig.factLabel || 'нет абонемента'
                              )}
                            </AdminClientListAbonFact>
                            {!factIsDesk ? (
                              <div className="td-client-fact">
                                <span className="td-client-fact__label">Последняя</span>
                                <span className="td-client-fact__value">{last}</span>
                              </div>
                            ) : null}
                            {!factIsDesk ? <LoyaltyGlanceChip snapshot={loyaltyGlanceById[c.id]} /> : null}
                            {birthdayLabel ? (
                              <div className="td-client-fact">
                                <span className="td-client-fact__label">ДР</span>
                                <span className="td-client-fact__value">{birthdayLabel}</span>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                        {isDeskClient ? (
                          <div className="td-client-fact">
                            <span className="td-client-fact__label">Пакет</span>
                            <span className="td-client-fact__value">
                              {deskPkg && deskPkg !== '—' ? deskPkg : '—'}
                            </span>
                          </div>
                        ) : (
                          <div className="td-client-fact">
                            <span className="td-client-fact__label">Тренер</span>
                            <span className="td-client-fact__value">{trainerLabel(c.trainer_id)}</span>
                          </div>
                        )}
                        {clientsTab === 'az' || hall === 'az' ? (
                          <div className="td-client-fact">
                            <span className="td-client-fact__label">Направление</span>
                            <span className="td-client-fact__value">
                              {deskAzDirectionLabel(
                                deskMemForPkg?.membership_type_id ?? active?.membership_type_id,
                                azMembershipTypes,
                              )}
                            </span>
                          </div>
                        ) : null}
                        {(clientsTab === 'az' || hall === 'az') && (deskMemForPkg || active) ? (
                          <div className="td-client-fact">
                            <span className="td-client-fact__label">Занятия</span>
                            <span className="td-client-fact__value">
                              {formatDeskAzSessionUsageRu(deskMemForPkg || active)}
                            </span>
                          </div>
                        ) : null}
                        <AdminClientListAbonFact typeCode={abonTypeCode}>
                          {isDeskClient ? (
                            active ? (
                              <>до {formatDateRu(active.end_date)}</>
                            ) : (
                              sig.factLabel || 'нет абонемента'
                            )
                          ) : active ? (
                            <>
                              до {formatDateRu(active.end_date)}
                              <span className="td-client-fact__sub">
                                {' '}
                                · {membershipUsageLabel(active, clientTrainings)}
                              </span>
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
                            sig.factLabel || 'нет абонемента'
                          )}
                        </AdminClientListAbonFact>
                        {!isDeskClient ? (
                          <div className="td-client-fact">
                            <span className="td-client-fact__label">Последняя</span>
                            <span className="td-client-fact__value">{last}</span>
                          </div>
                        ) : null}
                        {!isDeskClient ? <LoyaltyGlanceChip snapshot={loyaltyGlanceById[c.id]} /> : null}
                        {birthdayLabel ? (
                          <div className="td-client-fact">
                            <span className="td-client-fact__label">ДР</span>
                            <span className="td-client-fact__value">{birthdayLabel}</span>
                          </div>
                        ) : null}
                          </>
                        )}
                        {clientsTab === 'archive' ? <ClientArchiveReasonFact client={c} /> : null}
                      </div>
                      <div className="row td-client-actions">
                        <AdminClientMaxButton
                          client={c}
                          mode={rowSmsMode.mode}
                          scenario={rowSmsMode.scenario}
                          scenarioLabel={rowSmsMode.label}
                          memList={crossHallSearch ? mlistAll : mlist}
                          trainerName={trainerNameById[String(c.trainer_id ?? '')] || ''}
                          clubName={clubSmsClubName}
                          today={today}
                          templates={clubSmsTemplates}
                          busy={busy}
                          onFeedback={onSmsFeedback}
                        />
                        <AdminClientClubSmsButton
                          clubId={club}
                          client={c}
                          mode={rowSmsMode.mode}
                          scenario={rowSmsMode.scenario}
                          scenarioLabel={rowSmsMode.label}
                          memList={crossHallSearch ? mlistAll : mlist}
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
                        <AdminClientClubCallButton
                          clubId={club}
                          client={c}
                          clubName={clubSmsClubName}
                          configured={clubSmsConfigured}
                          busy={busy}
                          onFeedback={onSmsFeedback}
                        />
                        <Link
                          to={cardHrefForClient(c.id)}
                          state={cardNavSeed}
                          className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                          aria-label="Карточка клиента"
                          title="Карточка клиента"
                        >
                          <UserCircle size={20} aria-hidden />
                        </Link>
                        {clientsTab === 'archive' ? (
                          <ClientArchiveReasonEditButton
                            client={c}
                            busy={busy}
                            onEdit={(row) => setArchiveReasonModal({ mode: 'edit', client: row })}
                          />
                        ) : null}
                        {clientsTab === 'az' && azDeductMem ? (
                          <AdminDeskAzDeductButton
                            membership={azDeductMem}
                            clientName={formatClientName(c.name) || String(c.name ?? '')}
                            compact
                            onDone={() => void reload({ silent: true })}
                            onToast={(msg) => setRefreshMsg(msg)}
                          />
                        ) : null}
                        <ClientRowMoreMenu
                          disabled={busy}
                          ariaLabel={`Ещё действия: ${formatClientName(c.name) || c.name || c.id}`}
                          items={[
                            club
                              ? {
                                  id: 'call-history',
                                  label: 'История связи',
                                  icon: History,
                                  onSelect: () => setCallHistoryClient(c),
                                }
                              : null,
                            clientsTab !== 'archive' &&
                            shouldOfferAdminCloseHall({
                              clientsTab,
                              client: c,
                              memberships: mlistAll,
                              lifecycleRows,
                              asOf: today,
                            })
                              ? {
                                  id: 'close-hall',
                                  label: adminClientsCloseHallLabel(
                                    resolveAdminClientsActionHall(clientsTab),
                                  ),
                                  icon: Archive,
                                  onSelect: () =>
                                    setArchiveReasonModal({
                                      mode: 'enter',
                                      client: c,
                                      action: 'close_hall',
                                      hall: resolveAdminClientsActionHall(clientsTab),
                                    }),
                                }
                              : null,
                            clientsTab !== 'archive' &&
                            shouldOfferAdminReopenHall({
                              clientsTab,
                              client: c,
                              memberships: mlistAll,
                              lifecycleRows,
                              asOf: today,
                            })
                              ? {
                                  id: 'reopen-hall',
                                  label: adminClientsReopenHallLabel(
                                    resolveAdminClientsActionHall(clientsTab),
                                  ),
                                  icon: RotateCcw,
                                  onSelect: () =>
                                    void restoreClientArchive(
                                      c,
                                      resolveAdminClientsActionHall(clientsTab),
                                    ),
                                }
                              : null,
                            clientsTab === 'archive'
                              ? {
                                  id: 'archive-reason',
                                  label: clientNeedsArchiveReason(c)
                                    ? 'Указать причину'
                                    : 'Изменить причину',
                                  icon: Pencil,
                                  onSelect: () =>
                                    setArchiveReasonModal({ mode: 'edit', client: c }),
                                }
                              : null,
                            clientsTab !== 'archive'
                              ? {
                                  id: 'leave-club',
                                  label: 'Ушёл из клуба',
                                  icon: Archive,
                                  onSelect: () =>
                                    setArchiveReasonModal({
                                      mode: 'enter',
                                      client: c,
                                      action: 'leave_club',
                                    }),
                                }
                              : null,
                            clientsTab === 'archive'
                              ? {
                                  id: 'restore',
                                  label: 'Вернуть в клуб',
                                  icon: RotateCcw,
                                  onSelect: () => void restoreClientArchive(c),
                                }
                              : null,
                            canSalesManagerHardDeleteClient(isSalesManager, c, {
                              memberships: memByClient[c.id] ?? [],
                              lifecycleRows,
                              asOf: today,
                            })
                              ? {
                                  id: 'delete',
                                  label: 'Удалить',
                                  icon: Trash2,
                                  danger: true,
                                  onSelect: () =>
                                    setConfirmDelete({ id: c.id, name: c.name ?? 'Клиент' }),
                                }
                              : null,
                          ].filter(Boolean)}
                        />
                      </div>
                    </div>
                    {crossHallSearch ? (
                      <AdminClientHallStack
                        items={hallStack}
                        linkState={cardNavSeed}
                        buildHref={(hall) =>
                          buildAdminClientCardHref(clientsBasePath, c.id, {
                            ...listNavState,
                            hall,
                          })
                        }
                      />
                    ) : null}
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
          if (club) invalidateAdminClientsListMemory(club)
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
