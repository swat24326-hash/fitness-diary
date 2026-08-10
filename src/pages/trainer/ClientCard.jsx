import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Dumbbell, ClipboardList, Pencil } from 'lucide-react'
import { ClientDiaries } from '../../components/ClientDiaries'
import { ClientOverview } from './ClientOverview'
import { ClientNutritionPage } from './ClientNutritionPage'
import { ClientHomeworkPage } from './ClientHomeworkPage'
import { Statistics } from './Statistics'
import { getHealthCard, getLocalClient, hydrateAdminClientWorkspace, listMemberships, listTrainingsForClient, listTrainerSummariesForAdmin } from '../../lib/dataAccess'
import { isSupabaseConfigured } from '../../lib/supabase'
import { canStartNewTrainingForMemberships } from '../../lib/membershipRules'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from '../../lib/syncService'
import { useAuth } from '../../context/AuthContext'
import { useDebouncedStorageReload, shouldReloadTrainerClientStats } from '../../lib/useDebouncedStorageReload'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { IskraDispatchModal } from '../../components/iskra/IskraDispatchModal.jsx'
import { buildClientCardTaskDraft } from '../../lib/admin/staffTaskCreateCore.js'
import { useClubDispatchRecipients } from '../../hooks/useClubDispatchRecipients.js'
import { listOutreachLogByClientId } from '../../lib/trainer/trainerOutreachLogService.js'
import { ClientPnkPanel } from '../../components/trainer/ClientPnkPanel.jsx'
import { PnkVisitQualityReport } from '../../components/pnk/PnkVisitQualityReport.jsx'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { isOpenPnkClient, isPnkCardTabVisible, resolvePnkTrainerUiStep } from '../../lib/pnk/pnkStagesCore.js'
import { countPnkBzCompletedFromTrainings } from '../../lib/pnk/pnkBzCompletedCore.js'
import { buildPnkVisitQualityReport, shouldShowPnkVisitQuality } from '../../lib/pnk/pnkVisitQualityCore.js'
import { listClientsByClubId, listMeasurementsByClientId } from '../../lib/localDbClubQuery.js'
import { assertClubCardAvailableForCreate } from '../../lib/admin/salesClientMatchCore.js'
import { preparePnkTrialTraining, patchPnkClientLocal } from '../../lib/pnk/pnkLocalService.js'
import { canStartPnkTrialTraining } from '../../lib/pnk/pnkWizardCore.js'
import {
  OUTREACH_SCENARIO_LABELS,
  normalizeOutreachName,
  normalizeMaxChatUrl,
  resolveClientGreetingName,
} from '../../lib/trainer/trainerClientOutreachCore.js'
import { AdminDeskClientCardSection } from '../../components/admin/AdminDeskClientCardSection.jsx'
import { AdminLitePzClientCardSection } from '../../components/admin/AdminLitePzClientCardSection.jsx'
import { AdminMultiHallClientCardSection } from '../../components/admin/AdminMultiHallClientCardSection.jsx'
import {
  adminUsesMultiHallClientCard,
  resolveInitialClientHallTab,
  roleCanManageMultiHallClientCard,
} from '../../lib/admin/clientHallTabsCore.js'
import { isDeskHallClient } from '../../lib/admin/holdingClientsCore.js'
import { isTrainerWithoutTablet } from '../../lib/admin/trainerTabletModeCore.js'
import {
  clientCardBackLabel,
  resolveClientCardBackHref,
} from '../../lib/admin/clientCardReturnCore.js'
import {
  clientCardUsesGlanceLocal,
  clientWorkspaceScopeForClient,
} from '../../lib/admin/clientWorkspaceScopeCore.js'

export function ClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin, isTrainer, isSalesManager, isSupervisor, user } = useAuth()
  /** Админ, управляющий и менеджер тянут карточку через /api/get-client. */
  const canCloudHydrateClient = Boolean(isAdmin || isSalesManager || isSupervisor)
  /** Коммерческий контур клуба: desk / lite / список клиентов. */
  const canManageClubClients = roleCanManageMultiHallClientCard({
    isAdmin,
    isSalesManager,
    isSupervisor,
  })
  /** Планёрка с карточки — админ сети и управляющий. */
  const canAssignClubTasks = Boolean(isAdmin || isSupervisor)
  const clientsListHref = useMemo(
    () => resolveClientCardBackHref(searchParams, { isAdmin, isSalesManager, isSupervisor }),
    [isAdmin, isSalesManager, isSupervisor, searchParams],
  )
  const clientsBackLabel = useMemo(
    () => clientCardBackLabel(searchParams.get('from')),
    [searchParams],
  )
  const adminClubQs = useMemo(() => {
    const c = searchParams.get('club')
    return c ? `?club=${encodeURIComponent(c)}` : ''
  }, [searchParams])
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    if (
      t === 'health' ||
      t === 'memberships' ||
      t === 'diaries' ||
      t === 'stats' ||
      t === 'nutrition' ||
      t === 'homework'
    ) {
      return t
    }
    return 'health'
  })
  const seedClient = useMemo(() => {
    const seed = location.state?.clientSeed
    if (!seed || String(seed.id) !== String(id)) return null
    return seed
  }, [location.state, id])
  const [client, setClient] = useState(() => seedClient)
  const [memberships, setMemberships] = useState([])
  const [healthCard, setHealthCard] = useState(null)
  const [bzCompletedCount, setBzCompletedCount] = useState(0)
  const [hasMeasurements, setHasMeasurements] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', birth_date: '', card_number: '', outreach_name: '', max_chat_url: '' })
  const [hydrateError, setHydrateError] = useState(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [outreachLogs, setOutreachLogs] = useState([])
  const [trainerById, setTrainerById] = useState({})
  const [trainersModeReady, setTrainersModeReady] = useState(!canManageClubClients)
  const [bootstrapping, setBootstrapping] = useState(true)
  const hydrateGenRef = useRef(0)

  useEffect(() => {
    if (!canManageClubClients) {
      setTrainersModeReady(true)
      return undefined
    }
    let alive = true
    setTrainersModeReady(false)
    void listTrainerSummariesForAdmin()
      .then((rows) => {
        if (!alive) return
        const map = {}
        for (const t of rows ?? []) {
          if (t?.id) map[t.id] = t
        }
        setTrainerById(map)
        setTrainersModeReady(true)
      })
      .catch(() => {
        if (!alive) return
        setTrainerById({})
        setTrainersModeReady(true)
      })
    return () => {
      alive = false
    }
  }, [canManageClubClients])

  const isDeskClient = Boolean(canManageClubClients && isDeskHallClient(client))
  /** Одна карточка с переключателем ПЗ/ТЗ/АЗ — всегда для admin/sales/supervisor. */
  const isMultiHallCard = adminUsesMultiHallClientCard(
    { isAdmin, isSalesManager, isSupervisor },
    client,
  )
  const hallQuery = searchParams.get('hall')
  const multiHallTab = useMemo(() => {
    if (!client || !isMultiHallCard) return 'pz'
    return resolveInitialClientHallTab(client, memberships, hallQuery)
  }, [client, isMultiHallCard, memberships, hallQuery])
  const onMultiHallTabChange = useCallback(
    (hall) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const h = String(hall ?? '').trim()
          if (h) next.set('hall', h)
          else next.delete('hall')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const multiHallClubId = useMemo(
    () => String(client?.club_id ?? searchParams.get('club') ?? ''),
    [client?.club_id, searchParams],
  )
  const trainerListScope = isSalesManager || isSupervisor ? 'club' : 'all'
  const clientTrainerRow = useMemo(() => {
    const tid = String(client?.trainer_id ?? '').trim()
    if (!tid) return null
    return trainerById[tid] ?? null
  }, [client, trainerById])
  const isLitePz = useMemo(() => {
    if (!client || isDeskHallClient(client)) return false
    if (canManageClubClients) {
      if (!trainersModeReady || !clientTrainerRow) return false
      return isTrainerWithoutTablet(clientTrainerRow)
    }
    if (isTrainer && isTrainerWithoutTablet(user) && String(client.trainer_id ?? '') === String(user?.id ?? '')) {
      return true
    }
    return false
  }, [client, canManageClubClients, isTrainer, user, trainersModeReady, clientTrainerRow])
  const adminModePending = Boolean(
    canManageClubClients && client && !isDeskHallClient(client) && client.trainer_id && !trainersModeReady,
  )
  const adminModeUnknown = Boolean(
    canManageClubClients &&
      client &&
      !isDeskHallClient(client) &&
      client.trainer_id &&
      trainersModeReady &&
      !clientTrainerRow,
  )
  const liteListHref = clientsListHref
  const liteTrainerName = useMemo(() => {
    const tid = String(client?.trainer_id ?? '')
    if (!tid) return ''
    if (trainerById[tid]?.name) return trainerById[tid].name
    if (String(user?.id ?? '') === tid) return user?.name ?? ''
    return ''
  }, [client, trainerById, user])

  const syncPnkTab = useCallback(
    (c, ctx) => {
      if (!c || !isOpenPnkClient(c)) return
      const step = resolvePnkTrainerUiStep(c, ctx)
      if (!step) return
      if (step.key === 'close') {
        setTab('memberships')
        return
      }
      if (step.tab) setTab(step.tab)
    },
    [],
  )

  const pnkUiCtx = useMemo(
    () => ({ healthCard, bzCompletedCount }),
    [healthCard, bzCompletedCount],
  )

  /** Синхрон с шагом воронки — без зависимости от tab (иначе «Далее» мигает предыдущей вкладкой). */
  useEffect(() => {
    syncPnkTab(client, pnkUiCtx)
  }, [client, pnkUiCtx, syncPnkTab])

  const onOpenPnkTab = useCallback((t) => {
    if (t) setTab(t)
  }, [])

  const taskClubId = useMemo(() => {
    if (!canAssignClubTasks || !client) return ''
    return String(client.club_id ?? searchParams.get('club') ?? user?.club_id ?? '').trim()
  }, [canAssignClubTasks, client, searchParams, user?.club_id])
  const { recipients: taskRecipients } = useClubDispatchRecipients(taskClubId, { includeSalesManagers: true })
  const clientTaskDraft = useMemo(
    () => (client && canAssignClubTasks ? buildClientCardTaskDraft(client) : null),
    [client, canAssignClubTasks],
  )

  const reloadLocal = useCallback(async () => {
    const local = await getLocalClient(id)
    setClient(local ?? null)
    if (!local) {
      setMemberships([])
      setHealthCard(null)
      setBzCompletedCount(0)
      setHasMeasurements(false)
      return
    }
    const tid = String(local.trainer_id ?? '').trim()
    const trainerRow = tid ? trainerById[tid] ?? null : null
    const liteGuess =
      !isDeskHallClient(local) &&
      Boolean(
        (canManageClubClients && trainersModeReady && trainerRow && isTrainerWithoutTablet(trainerRow)) ||
          (isTrainer &&
            isTrainerWithoutTablet(user) &&
            String(local.trainer_id ?? '') === String(user?.id ?? '')),
      )
    // Desk / lite: только абоны — без тяжёлых getAll trainings/measurements.
    if (clientCardUsesGlanceLocal(local, { litePz: liteGuess })) {
      const mems = await listMemberships(id)
      setMemberships(mems)
      setHealthCard(null)
      setBzCompletedCount(0)
      setHasMeasurements(false)
      return
    }
    const [mems, hc, trainings, measures] = await Promise.all([
      listMemberships(id),
      getHealthCard(id),
      listTrainingsForClient(id),
      listMeasurementsByClientId(id),
    ])
    setMemberships(mems)
    setHealthCard(hc ?? null)
    setBzCompletedCount(countPnkBzCompletedFromTrainings(trainings))
    setHasMeasurements((measures ?? []).length > 0)
  }, [id, trainerById, trainersModeReady, canManageClubClients, isTrainer, user])

  useEffect(() => {
    if (!id || canManageClubClients) return
    void listOutreachLogByClientId(id, 3).then(setOutreachLogs)
  }, [id, canManageClubClients])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (
      t === 'health' ||
      t === 'memberships' ||
      t === 'diaries' ||
      t === 'stats' ||
      t === 'nutrition' ||
      t === 'homework'
    ) {
      setTab(t)
    }
  }, [searchParams])

  const hydrateFromCloudInBackground = useCallback(async () => {
    if (!isSupabaseConfigured() || !navigator.onLine) return
    const gen = ++hydrateGenRef.current
    setHydrateError(null)
    const local = await getLocalClient(id)
    if (gen !== hydrateGenRef.current) return
    const scope = clientWorkspaceScopeForClient(local || client, { litePz: isLitePz })
    const h = await hydrateAdminClientWorkspace(id, {
      allowBrowserFallback: Boolean(canCloudHydrateClient),
      scope,
    })
    if (gen !== hydrateGenRef.current) return
    if (h.ok) {
      await reloadLocal()
      return
    }
    if (h.reason === 'not_found') {
      const again = await getLocalClient(id)
      if (gen !== hydrateGenRef.current) return
      if (!again) {
        setClient(null)
        setMemberships([])
      }
      return
    }
    if (!h.ok && h.reason !== 'not_found') {
      setHydrateError(h.error ?? h.reason ?? 'Ошибка загрузки с сервера')
    }
  }, [id, reloadLocal, client, canCloudHydrateClient, isLitePz])

  const onMultiHallSaved = useCallback(() => {
    void reloadLocal().then(() => {
      if (canCloudHydrateClient) void hydrateFromCloudInBackground()
    })
  }, [canCloudHydrateClient, hydrateFromCloudInBackground, reloadLocal])

  const canStartTraining = useMemo(() => {
    const today = todayLocalIso()
    return canStartNewTrainingForMemberships(memberships, today)
  }, [memberships])

  const pnkCloseMemberships = useMemo(() => {
    if (!client || !isOpenPnkClient(client)) return false
    const step = resolvePnkTrainerUiStep(client, { healthCard, bzCompletedCount })
    return step?.key === 'close'
  }, [client, healthCard, bzCompletedCount])

  const isArchived = Boolean(client?.archived_at)

  const restoreFromArchive = useCallback(async () => {
    if (!client?.id) return
    setArchiveBusy(true)
    try {
      const row = { ...client, archived_at: null }
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: client.id })
      const flush = await flushCriticalWritesToCloud()
      const warn = criticalWriteCloudWarning(flush, 'Возврат из архива')
      if (warn) alert(warn)
      await reloadLocal()
    } catch (err) {
      alert(err?.message ?? 'Не удалось вернуть из архива')
    } finally {
      setArchiveBusy(false)
    }
  }, [client, reloadLocal])

  useEffect(() => {
    hydrateGenRef.current += 1
    let alive = true
    // Local-first: UI из IDB/seed; hydrate — когда известен desk или готовы тренеры (lite vs full).
    void reloadLocal()
      .then(async () => {
        if (!alive) return
        setBootstrapping(false)
        if (typeof navigator === 'undefined' || !navigator.onLine) return
        if (!(canCloudHydrateClient || isTrainer)) return
        const local = await getLocalClient(id)
        if (!alive) return
        if (isDeskHallClient(local)) {
          void hydrateFromCloudInBackground()
          return
        }
        if (canManageClubClients && !trainersModeReady) return
        void hydrateFromCloudInBackground()
      })
      .catch(() => {
        if (alive) setBootstrapping(false)
      })
    return () => {
      alive = false
      hydrateGenRef.current += 1
    }
  }, [
    id,
    isTrainer,
    canCloudHydrateClient,
    canManageClubClients,
    trainersModeReady,
    reloadLocal,
    hydrateFromCloudInBackground,
  ])

  useDebouncedStorageReload(
    () => {
      void reloadLocal()
    },
    { shouldRun: shouldReloadTrainerClientStats },
  )

  const openEdit = () => {
    if (isArchived) {
      alert('Клиент в архиве. Чтобы редактировать и вести тренировки — сначала нажмите «Вернуть из архива».')
      return
    }
    setEditForm({
      name: client.name ?? '',
      phone: client.phone ?? '',
      birth_date: client.birth_date ?? '',
      card_number: client.card_number ?? '',
      outreach_name: client.outreach_name ?? '',
      max_chat_url: client.max_chat_url ?? '',
    })
    setEditOpen(true)
  }

  const saveClient = async (e) => {
    e.preventDefault()
    if (isArchived) {
      alert('Клиент в архиве. Чтобы редактировать — сначала нажмите «Вернуть из архива».')
      return
    }
    const name = formatClientName(editForm.name)
    if (!name) return
    const outreach_name = normalizeOutreachName(editForm.outreach_name) || null
    const max_chat_url = normalizeMaxChatUrl(editForm.max_chat_url) || null
    const card_number = String(editForm.card_number ?? '').trim() || null
    const clubId = client.club_id ?? user?.club_id
    if (card_number && clubId) {
      try {
        const clubClients = await listClientsByClubId(clubId)
        const cardCheck = assertClubCardAvailableForCreate(clubClients, clubId, card_number, {
          excludeClientId: client.id,
        })
        if (!cardCheck.ok) {
          alert(cardCheck.error)
          return
        }
      } catch {
        /* офлайн — облако отловит unique при Sync */
      }
    }
    const row = {
      ...client,
      name,
      phone: String(editForm.phone ?? '').trim() || null,
      birth_date: editForm.birth_date || null,
      card_number,
      outreach_name,
      max_chat_url,
    }
    try {
      await saveLocalWithSync('clients', row, { table_name: 'clients', operation: 'update', remote_id: client.id })
    } catch (err) {
      alert(err?.message ?? 'Ошибка сохранения')
      return
    }
    setEditOpen(false)
    await reloadLocal()
  }

  const startPnkTraining = useCallback(async () => {
    if (!client?.id) return
    const gate = canStartPnkTrialTraining(client, { healthCard, bzCompletedCount })
    if (!gate.ok) {
      alert(gate.reason || 'Сначала завершите предыдущие шаги воронки')
      return
    }
    const res = await preparePnkTrialTraining(client, { isAdmin })
    if (!res.ok) {
      alert(res.error || 'Не удалось открыть тренировку')
      return
    }
    if (res.createdMembership) {
      void reloadLocal()
    }
    navigate(res.path)
  }, [client, isAdmin, navigate, reloadLocal, healthCard, bzCompletedCount])

  /** После сохранения рациона — только обновить кэш (не двигать шаг ПНК). */
  const onNutritionPlanSaved = useCallback(async () => {
    await reloadLocal()
  }, [reloadLocal])

  const markPnkHomeworkIssued = useCallback(async () => {
    if (!client || !isOpenPnkClient(client) || isArchived) return
    const step = resolvePnkTrainerUiStep(client, { healthCard, bzCompletedCount })
    const deliverable = step?.key === 'hw2' ? 'homework2' : 'homework'
    const res = await patchPnkClientLocal(client, { deliverable })
    if (res.ok) {
      setClient(res.client)
      void reloadLocal()
    }
  }, [client, isArchived, reloadLocal, healthCard, bzCompletedCount])

  if (bootstrapping && !client) {
    return (
      <div className="trainer-path-empty" role="status">
        <p className="trainer-path-empty__text">Загружаю карточку…</p>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="trainer-path-empty" role="status">
        <p className="trainer-path-empty__text">
          Клиент не найден. <Link to={clientsListHref}>{clientsBackLabel.replace(/^←\s*/, '') || 'Назад'}</Link>
        </p>
      </div>
    )
  }

  if (isMultiHallCard && multiHallTab !== 'pz') {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <AdminMultiHallClientCardSection
          client={client}
          memberships={memberships}
          clubId={multiHallClubId}
          listHref={clientsListHref}
          listBackLabel={clientsBackLabel}
          preferredHall={searchParams.get('hall')}
          hallTab={multiHallTab}
          onHallTabChange={onMultiHallTabChange}
          trainerListScope={trainerListScope}
          onSaved={onMultiHallSaved}
        />
      </div>
    )
  }

  if (isMultiHallCard && multiHallTab === 'pz' && adminModePending) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <AdminMultiHallClientCardSection
          client={client}
          memberships={memberships}
          clubId={multiHallClubId}
          listHref={clientsListHref}
          listBackLabel={clientsBackLabel}
          preferredHall={searchParams.get('hall')}
          hallTab="pz"
          onHallTabChange={onMultiHallTabChange}
          omitPzPane
          trainerListScope={trainerListScope}
          onSaved={onMultiHallSaved}
        />
        <p className="muted" role="status" style={{ margin: 0 }}>
          Определяю режим тренера (планшет / без)…
        </p>
      </div>
    )
  }

  if (isMultiHallCard && multiHallTab === 'pz' && adminModeUnknown) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <AdminMultiHallClientCardSection
          client={client}
          memberships={memberships}
          clubId={multiHallClubId}
          listHref={clientsListHref}
          listBackLabel={clientsBackLabel}
          preferredHall={searchParams.get('hall')}
          hallTab="pz"
          onHallTabChange={onMultiHallTabChange}
          omitPzPane
          trainerListScope={trainerListScope}
          onSaved={onMultiHallSaved}
        />
        <p className="muted" role="alert" style={{ margin: 0 }}>
          Не удалось узнать режим тренера (есть планшет или нет). Обновите страницу и откройте карточку снова.
        </p>
        <p style={{ margin: 0 }}>
          <Link to={clientsListHref} className="u-no-decoration muted" style={{ fontSize: 14 }}>
            {clientsBackLabel}
          </Link>
        </p>
      </div>
    )
  }

  if (isMultiHallCard && multiHallTab === 'pz' && isLitePz) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <AdminMultiHallClientCardSection
          client={client}
          memberships={memberships}
          clubId={multiHallClubId}
          listHref={clientsListHref}
          listBackLabel={clientsBackLabel}
          preferredHall={searchParams.get('hall')}
          hallTab="pz"
          onHallTabChange={onMultiHallTabChange}
          trainerListScope={trainerListScope}
          onSaved={onMultiHallSaved}
        />
      </div>
    )
  }

  if (isDeskClient && !isMultiHallCard) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <AdminDeskClientCardSection
          client={client}
          memberships={memberships}
          clubId={String(client.club_id ?? searchParams.get('club') ?? '')}
          listHref={clientsListHref}
          listBackLabel={clientsBackLabel}
          onSaved={onMultiHallSaved}
        />
      </div>
    )
  }

  if (adminModePending && !isMultiHallCard) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <p className="muted" role="status" style={{ margin: 0 }}>
          Определяю режим тренера (планшет / без)…
        </p>
      </div>
    )
  }

  if (adminModeUnknown && !isMultiHallCard) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <p className="muted" role="alert" style={{ margin: 0 }}>
          Не удалось узнать режим тренера (есть планшет или нет). Обновите страницу и откройте карточку снова.
        </p>
        <p style={{ margin: 0 }}>
          <Link to={clientsListHref} className="u-no-decoration muted" style={{ fontSize: 14 }}>
            {clientsBackLabel}
          </Link>
        </p>
      </div>
    )
  }

  if (isLitePz && !isMultiHallCard) {
    return (
      <div className="grid trainer-path-card" style={{ gap: 18 }}>
        <AdminLitePzClientCardSection
          client={client}
          memberships={memberships}
          clubId={String(client.club_id ?? searchParams.get('club') ?? '')}
          trainerName={liteTrainerName}
          listHref={liteListHref}
          listBackLabel={clientsBackLabel}
          onSaved={onMultiHallSaved}
        />
      </div>
    )
  }

  return (
    <div className="grid trainer-path-card" style={{ gap: 18 }}>
      {isMultiHallCard ? (
        <AdminMultiHallClientCardSection
          client={client}
          memberships={memberships}
          clubId={multiHallClubId}
          listHref={clientsListHref}
          listBackLabel={clientsBackLabel}
          preferredHall={searchParams.get('hall')}
          hallTab="pz"
          onHallTabChange={onMultiHallTabChange}
          omitPzPane
          trainerListScope={trainerListScope}
          onSaved={onMultiHallSaved}
        />
      ) : canManageClubClients ? (
        <p style={{ margin: 0 }}>
          <Link to={clientsListHref} className="u-no-decoration muted" style={{ fontSize: 14 }}>
            {clientsBackLabel}
          </Link>
        </p>
      ) : null}
      {hydrateError ? (
        <p className="muted admin-inline-note" role="alert">
          Данные с сервера подгрузились не полностью: {hydrateError}. Показано из локального кэша.
        </p>
      ) : null}
      {isArchived ? (
        <p className="admin-inline-note" style={{ margin: 0 }} role="status">
          Клиент в <strong>архиве</strong>. Просмотр доступен, но все действия (редактирование, абонементы, тренировки) — только после «Вернуть».
          <span style={{ display: 'inline-block', marginLeft: 10 }}>
            <button type="button" className="btn btn-primary btn-touch btn-xs" disabled={archiveBusy} onClick={() => void restoreFromArchive()}>
              {archiveBusy ? '…' : 'Вернуть из архива'}
            </button>
          </span>
        </p>
      ) : null}
      {editOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Редактирование клиента" onClick={() => setEditOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Клиент</h3>
            <form onSubmit={saveClient} className="grid" style={{ gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">ФИО *</label>
                <input
                  className="input"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, name: formatClientName(f.name) }))}
                  placeholder="Фамилия Имя Отчество или Фамилия И.О."
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Телефон</label>
                <input className="input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Дата рождения</label>
                <input className="input" type="date" value={editForm.birth_date} onChange={(e) => setEditForm((f) => ({ ...f, birth_date: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Номер карты</label>
                <input className="input" value={editForm.card_number} onChange={(e) => setEditForm((f) => ({ ...f, card_number: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Имя для сообщений в Max</label>
                <input
                  className="input"
                  value={editForm.outreach_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, outreach_name: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, outreach_name: normalizeOutreachName(f.outreach_name) }))}
                  placeholder="Например: Роман"
                />
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.35 }}>
                  Для Max: при полном имени во ФИО подставится само (второе слово). Если только инициалы — впишите имя
                  сюда, иначе будет «Привет!» без имени.
                  {(() => {
                    const g = resolveClientGreetingName({
                      name: editForm.name,
                      outreach_name: editForm.outreach_name,
                    })
                    return g ? ` Сейчас: ${g}.` : ' Сейчас: без имени.'
                  })()}
                </p>
              </div>
              <div className="field">
                <label className="label">Ссылка на чат в Max</label>
                <input
                  className="input"
                  value={editForm.max_chat_url}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_chat_url: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, max_chat_url: normalizeMaxChatUrl(f.max_chat_url) }))}
                  placeholder="https://max.ru/u/…"
                  title="Max → профиль → Поделиться. Без ссылки — выбор чата вручную."
                  inputMode="url"
                  autoComplete="off"
                />
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-touch" onClick={() => setEditOpen(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary btn-touch">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="trainer-path-head">
        <div className="trainer-path-head__left">
          <div className="trainer-path-head__title-row">
            <h1 className="trainer-path-head__title">{client.name}</h1>
            {String(client.lifecycle ?? '') === 'pnk_lost' ? (
              <span className="pnk-badge pnk-badge--lost" title="Отказ в воронке ПНК — не оформленный ДК">
                Отказ ПНК
              </span>
            ) : null}
            <button type="button" className="btn btn-ghost btn-icon-square" aria-label="Редактировать данные клиента" title="Редактировать" onClick={openEdit} disabled={isArchived}>
              <Pencil size={16} aria-hidden />
            </button>
            {canAssignClubTasks ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isArchived || !client.trainer_id || !taskRecipients.length}
                title={client.trainer_id ? 'Поставить задание тренеру' : 'У клиента нет тренера'}
                onClick={() => setTaskModalOpen(true)}
              >
                <ClipboardList size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
                Задание
              </button>
            ) : null}
          </div>
          {String(client.lifecycle ?? '') === 'pnk_lost' ? (
            <p className="trainer-path-head__lead" role="status">
              Отказ в воронке ПНК — это не оформленный клиент ДК
              {client.pnk_lost_reason ? ` (причина: ${client.pnk_lost_reason})` : ''}. Карточка сохранена для учёта в
              статистике.
            </p>
          ) : null}
          <div className="trainer-path-head__meta">
            <div>{client.phone ?? '—'}</div>
            <div>{client.birth_date ? formatDateRu(client.birth_date) : '—'}</div>
            {client.card_number ? <div>Карта: {client.card_number}</div> : null}
          </div>
          {!canManageClubClients && outreachLogs.length > 0 ? (
            <div className="trainer-outreach-history muted" style={{ marginTop: 8, fontSize: 12 }}>
              <strong style={{ color: 'var(--text)' }}>Сообщения в Max:</strong>
              <ul className="trainer-outreach-history__list">
                {outreachLogs.map((row) => (
                  <li key={row.id}>
                    {formatDateRu(String(row.created_at).slice(0, 10))} — {OUTREACH_SCENARIO_LABELS[row.scenario] ?? row.scenario}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {isTrainer ? (
          <div className="trainer-path-head__actions">
            {isArchived ? (
              <button
                type="button"
                className="btn btn-primary btn-icon-square btn-touch"
                style={{ opacity: 0.55, pointerEvents: 'auto' }}
                aria-disabled="true"
                aria-label="Новая тренировка"
                title="Новая тренировка"
                onClick={() => alert('Клиент в архиве — сначала «Вернуть из архива».')}
              >
                <Dumbbell size={20} aria-hidden />
              </button>
            ) : isOpenPnkClient(client) ? (
              <button
                type="button"
                className="btn btn-primary btn-icon-square btn-touch"
                aria-label="Провести бесплатную тренировку"
                title="Провести бесплатную — записать упражнения"
                onClick={() => void startPnkTraining()}
              >
                <Dumbbell size={20} aria-hidden />
              </button>
            ) : canStartTraining ? (
              <Link
                to={`/trainer/workouts/new?clientId=${client.id}`}
                className="btn btn-primary btn-icon-square btn-touch u-no-decoration"
                aria-label="Новая тренировка"
                title="Новая тренировка"
              >
                <Dumbbell size={20} aria-hidden />
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-icon-square btn-touch"
                style={{ opacity: 0.55, pointerEvents: 'auto' }}
                aria-disabled="true"
                aria-label="Новая тренировка"
                title="Нет действующего абонемента"
                onClick={() => alert('Нет действующего абонемента')}
              >
                <Dumbbell size={20} aria-hidden />
              </button>
            )}
          </div>
        ) : null}
      </header>
      {canManageClubClients ? (
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
          Тренера ПЗ меняют в поле выше и «Сохранить»; архив — в списке «Клиенты». Новую тренировку «с нуля» начинает только тренер; правки и черновики доступны здесь и в конструкторе.
        </p>
      ) : null}

      <ClientPnkPanel
        client={client}
        healthCard={healthCard}
        bzCompletedCount={bzCompletedCount}
        onUpdated={(next) => {
          setClient(next)
          syncPnkTab(next, pnkUiCtx)
          void reloadLocal()
        }}
        onRefused={() => {
          navigate(canManageClubClients ? clientsListHref : '/trainer', { replace: true })
        }}
        onOpenDiaries={() => setTab('diaries')}
        onOpenTab={onOpenPnkTab}
        onStartTraining={isArchived ? undefined : () => startPnkTraining()}
      />

      {canManageClubClients && shouldShowPnkVisitQuality(client) ? (
        <PnkVisitQualityReport
          report={buildPnkVisitQualityReport(client, {
            healthCard,
            bzCompletedCount,
            hasMeasurements,
          })}
        />
      ) : null}

      <div className="tabs" role="tablist">
        {[
          { id: 'health', label: 'Здоровье и обмеры' },
          { id: 'nutrition', label: 'Питание' },
          { id: 'homework', label: 'ДЗ' },
          { id: 'memberships', label: 'Абонементы' },
          { id: 'diaries', label: 'Тренировки' },
          { id: 'stats', label: 'Статистика' },
        ]
          .filter((t) => isPnkCardTabVisible(client, t.id, { healthCard, bzCompletedCount }))
          .map((t) => (
          <button key={t.id} type="button" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'health' &&
        (!isOpenPnkClient(client) || isPnkCardTabVisible(client, 'health', { healthCard, bzCompletedCount })) && (
          <ClientOverview
            client={client}
            onReload={reloadLocal}
            section="health"
            readOnly={isArchived || isSalesManager}
          />
        )}
      {tab === 'nutrition' &&
        (!isOpenPnkClient(client) || isPnkCardTabVisible(client, 'nutrition', { healthCard, bzCompletedCount })) && (
        <ClientNutritionPage
          client={client}
          readOnly={isArchived}
          onPlanSaved={isOpenPnkClient(client) && !isArchived ? onNutritionPlanSaved : undefined}
        />
      )}
      {tab === 'homework' &&
        (!isOpenPnkClient(client) || isPnkCardTabVisible(client, 'homework', { healthCard, bzCompletedCount })) && (
          <ClientHomeworkPage
            client={client}
            readOnly={isArchived}
            onHomeworkIssued={isOpenPnkClient(client) && !isArchived ? markPnkHomeworkIssued : undefined}
          />
        )}
      {tab === 'memberships' &&
        (!isOpenPnkClient(client) || isPnkCardTabVisible(client, 'memberships', { healthCard, bzCompletedCount })) && (
          <ClientOverview
            client={client}
            onReload={reloadLocal}
            section="memberships"
            readOnly={isArchived}
            membershipAutoOpen={pnkCloseMemberships && !isArchived}
            membershipPreferPaid={pnkCloseMemberships}
            showPaidAmount={canManageClubClients}
            membershipHall="pz"
          />
        )}
      {tab === 'stats' &&
        (!isOpenPnkClient(client) || isPnkCardTabVisible(client, 'stats', { healthCard, bzCompletedCount })) && (
          <Statistics clientId={client.id} />
        )}
      {tab === 'diaries' &&
        (!isOpenPnkClient(client) || isPnkCardTabVisible(client, 'diaries', { healthCard, bzCompletedCount })) && (
        <>
          {isOpenPnkClient(client) && !isArchived && !canManageClubClients ? (
            <div className="pnk-conduct-banner" style={{ marginBottom: 12 }}>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.92rem' }}>
                Здесь список уже проведённых. Чтобы записать упражнения — нажмите кнопку.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-touch"
                onClick={() => void startPnkTraining()}
              >
                <Dumbbell size={18} aria-hidden style={{ marginRight: 8, verticalAlign: -3 }} />
                Начать тренировку — записать упражнения
              </button>
            </div>
          ) : null}
          <ClientDiaries
            client={client}
            onDataChange={reloadLocal}
            clubQs={isAdmin ? adminClubQs : ''}
            readOnly={isArchived}
          />
        </>
      )}

      {canAssignClubTasks && clientTaskDraft ? (
        <IskraDispatchModal
          open={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          clubId={taskClubId}
          recipients={taskRecipients}
          trainers={taskRecipients}
          defaultDraft={clientTaskDraft}
          defaultRecipientId={clientTaskDraft.default_recipient_id ?? ''}
        />
      ) : null}
    </div>
  )
}
