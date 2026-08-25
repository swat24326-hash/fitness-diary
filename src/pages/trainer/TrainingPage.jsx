import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Calendar, Activity, Bluetooth, Info, Save, UserCircle } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton'
import { TrainingForm, emptyTrainingData } from '../../components/TrainingForm'
import { ContraindicationsToggle } from '../../components/ContraindicationsToggle'
import { useAuth } from '../../context/AuthContext'
import { getHealthCard, getLocalClient, listClubsLocal, listMemberships, listTrainingsForClient } from '../../lib/dataAccess'
import { clampIsoDateToToday, formatDateRu, isIsoDateAfterToday, todayLocalIso } from '../../lib/dateRu'
import { getDb } from '../../lib/localDb'
import {
  applyEarlyMembershipActivation,
  applyLateMembershipStart,
  loadEarlyActivationProposal,
  loadLateStartInspection,
  loadLateStartProposal,
} from '../../lib/trainer/membershipStartShiftService.js'
import { EarlyMembershipActivateSheet } from '../../components/trainer/EarlyMembershipActivateSheet.jsx'
import { useHeartRateSessions } from '../../context/HeartRateSessionsContext.jsx'
import { saveLocalWithSync, setBackgroundSyncPaused } from '../../lib/syncService'
import { clearOpenTrainingDraft, setOpenTrainingDraft } from '../../lib/openTrainingDraftGuard.js'
import { stripDirectionControls } from '../../lib/textInput'
import { getTrainingCompletionIssues } from '../../lib/trainingCompletionValidation'
import {
  isTrainingDraftEpochCurrent,
  resolveTrainingFormRemountKey,
  resolveTrainingPersistTargetId,
  shouldApplyTrainingPersistUi,
} from '../../lib/trainingDraftPageEpochCore.js'
import {
  buildTrainingDraftSessionSnapshot,
  dropTrainingDraftSession,
  isTrainingDraftSessionSnapshotReady,
  isTrainingDraftUiAligned,
  putTrainingDraftSession,
  shouldBlockMismatchedDraftPersist,
  takeTrainingDraftSessionEntry,
  peekTrainingDraftSessionEntry,
} from '../../lib/trainingDraftSessionCache.js'
import {
  shouldClearDurableAfterIdbSave,
} from '../../lib/trainingDraftDurableCore.js'
import { pickTrainingDraftRestore, workoutDraftContentScore } from '../../lib/trainingDraftRestoreCore.js'
import {
  clearTrainingDraftDurable,
  migrateTrainingDraftDurableNewToId,
  putTrainingDraftDurable,
  readTrainingDraftDurable,
} from '../../lib/trainingDraftDurableStorage.js'
import { useTrainingDraftHideFlush } from '../../hooks/useTrainingDraftHideFlush.js'
import { registerTrainingDraftUpdateFlush } from '../../lib/trainingDraftUpdateFlush.js'
import { migrateTrainingFormPlace, resolveTrainingFormPlaceKey } from '../../lib/trainingFormStepMemory.js'
import {
  isTrainingFirstCompletion,
  isTrainingStatusCompleted,
  resolveTrainingPersistStatus,
  shouldSkipDuplicateCompleteClick,
  shouldSkipDuplicateFirstCompletionSave,
  shouldSkipSilentPersistOfCompleted,
  shouldSkipSilentPersistWhileCompleteInFlight,
} from '../../lib/trainingPersistStatusCore'
import {
  TRAINING_SESSION_TYPES,
  deriveTrainingTypeFromExercises,
  normalizeExerciseFormat,
  normalizeExercisesForStorage,
} from '../../lib/trainingExerciseFormat'
import { patchPnkClientLocal } from '../../lib/pnk/pnkLocalService'
import { shouldOfferMarkPnkTrialDone } from '../../lib/pnk/pnkTrialTrainingCore'
import { resolvePnkTrialDeliverableAfterWorkout } from '../../lib/pnk/pnkWizardCore'
import { suggestTrainingPreWeightInput } from '../../lib/clientWeightCore'
import { getHealthSex } from '../../lib/healthCardCore.js'
import {
  ageYearsFromBirthDate,
  buildHrSessionSummary,
  estimateMaxHr,
  normalizeHrSessionSnapshot,
} from '../../lib/hr/hrSessionAgg.js'
import { hrConnectProfileHint } from '../../lib/hr/hrSessionsCore.js'
import { pickHrSessionForPersist } from '../../lib/hr/hrSessionPersistCore.js'
import {
  applyLoyaltyOnTrainingPersist,
  ensureLoyaltySessionStartedAt,
} from '../../lib/loyalty/loyaltyPersistCore.js'
import { loadLoyaltyCompleteSettings } from '../../lib/loyalty/loyaltyCompleteSettingsService.js'
import { LOYALTY_COMPLETE_SETTINGS_WAIT_MS } from '../../lib/loyalty/loyaltyTimeoutCore.js'
import { isLoyaltyProgramClient } from '../../lib/loyalty/loyaltyGlanceUiCore.js'
import { recordAppError } from '../../lib/appErrorJournal.js'
import { runTrainingCompleteFollowUp } from '../../lib/trainer/trainingCompleteFollowUp.js'
import { prefetchTrainerClientWorkspace } from '../../lib/trainer/trainingClientPrefetch.js'
import { ensureTrainingDataMembershipId } from '../../lib/trainingMembershipLinkCore.js'
import {
  applyMembershipFirstCompletionDebit,
  resolveMembershipForFirstCompletionDebit,
} from '../../lib/trainer/trainingMembershipDebit.js'
import { buildTrainingMembershipTileSummary } from '../../lib/trainer/trainingMembershipTileCore.js'
import { loadTrainingMembershipTileSummary } from '../../lib/trainer/trainingMembershipTileService.js'
import { useSyncOutboundPoll } from '../../hooks/useSyncOutboundPoll.js'

const TRAINING_TYPES = TRAINING_SESSION_TYPES

function sanitizeWorkoutData(w, opts = {}) {
  if (!w || typeof w !== 'object') return {}
  const { pre_hr: _dropHr, meal_note: _mn, survey_notes: _sn, readiness: _rd, ...rest } = w
  const sessionFallback = normalizeExerciseFormat(opts.sessionFallback, 'Силовая')
  const exercises = normalizeExercisesForStorage(w.exercises, sessionFallback)
  const hr_session = normalizeHrSessionSnapshot(rest.hr_session)
  const next = { ...rest, exercises }
  if (hr_session) next.hr_session = hr_session
  else delete next.hr_session
  return next
}

/** Сколько календарных дней от refIso до endIso (конец − опорная дата). */
function calendarDaysUntil(refIso, endIso) {
  if (!refIso || !endIso) return null
  const pr = String(refIso).split('-').map(Number)
  const pe = String(endIso).split('-').map(Number)
  if (pr.length !== 3 || pe.length !== 3 || pr.some((x) => !Number.isFinite(x)) || pe.some((x) => !Number.isFinite(x))) return null
  const refD = new Date(pr[0], pr[1] - 1, pr[2])
  const endD = new Date(pe[0], pe[1] - 1, pe[2])
  return Math.round((endD - refD) / 86400000)
}

/** Снимок содержимого формы для автосэйва (без id — иначе смена tid после первого save ломает debounce). */
function trainingContentFingerprint({ clientId, trainingType, trainingDate, status, workoutState }) {
  const derivedType = deriveTrainingTypeFromExercises(workoutState?.exercises, trainingType)
  return JSON.stringify({
    cid: clientId,
    type: derivedType,
    date: trainingDate,
    draft: status !== 'completed',
    data: sanitizeWorkoutData(workoutState, { sessionFallback: trainingType }),
  })
}

/** Тренер может менять дату только у уже завершённой тренировки; админ — всегда. */
function canEditTrainingDate(isAdmin, trainingStatus) {
  return isAdmin || trainingStatus === 'completed'
}

export function TrainingPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const clientIdParam = search.get('clientId')
  const { user, isAdmin } = useAuth()
  const nav = useNavigate()
  const clientsBase = isAdmin ? '/admin/clients' : '/trainer/clients'
  const workoutsBase = isAdmin ? '/admin/workouts' : '/trainer/workouts'
  const homeLink = isAdmin ? '/admin' : '/trainer'
  const preserveClubQs = useMemo(() => {
    const c = search.get('club')
    return c ? `?club=${encodeURIComponent(c)}` : ''
  }, [search])
  const isNew = id === 'new'
  const dateInputRef = useRef(null)
  const [client, setClient] = useState(null)
  const [workoutState, setWorkoutState] = useState(emptyTrainingData)
  const [trainingType, setTrainingType] = useState('Силовая')
  const [trainingDate, setTrainingDate] = useState(() => todayLocalIso())
  const [contra, setContra] = useState('')
  const [meta, setMeta] = useState({ status: 'draft', trainingId: null })
  const [loadState, setLoadState] = useState('loading')
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [membershipSummary, setMembershipSummary] = useState(null)
  const [healthCard, setHealthCard] = useState(null)
  const [otherCompletedTrainings, setOtherCompletedTrainings] = useState(0)
  const [autosaveStatus, setAutosaveStatus] = useState('idle') // idle | saving | saved | error
  const [completeBusy, setCompleteBusy] = useState(false)
  const [earlyActivateProposal, setEarlyActivateProposal] = useState(null)
  const [membershipShiftMode, setMembershipShiftMode] = useState(/** @type {'early' | 'late' | null} */ (null))
  const [earlyActivateOpen, setEarlyActivateOpen] = useState(false)
  const [earlyActivateBusy, setEarlyActivateBusy] = useState(false)
  const [earlyActivateError, setEarlyActivateError] = useState('')
  const [lateBlockedNotice, setLateBlockedNotice] = useState('')
  const [lateDraftOffer, setLateDraftOffer] = useState(false)
  const lateShiftDismissedRef = useRef(false)

  /** Снимок текущего экрана для LRU-кэша вкладок (оставляем до смены id). */
  const draftSessionGateRef = useRef({ id: '', snap: null })
  /** Layout уже применил сессионный кэш для этого route id — load только soft-refresh. */
  const sessionCacheHitRef = useRef(null)
  const saveMutexRef = useRef(Promise.resolve())
  const completeInFlightRef = useRef(false)
  const [hydrateVersion, bumpHydrateVersion] = useState(0)
  const autosaveTimerRef = useRef(null)
  const draftTrainingIdRef = useRef(null)
  /** Смена вкладки черновика: устаревший load/persist не пишет в чужой экран. */
  const pageEpochRef = useRef(0)
  /** Временный id буфера пульса до первого сохранения /workouts/new */
  const pendingHrScopeRef = useRef(null)
  const autosaveUiTimerRef = useRef(null)
  const userEditedRef = useRef(false)
  const baselineContentSnapshotRef = useRef('')
  /** Актуальный снимок формы для hide-flush / silent persist (без stale closure). */
  const liveDraftRef = useRef({
    loadState: 'loading',
    isNew: false,
    clientIdParam: '',
    meta: { status: 'draft', trainingId: null },
    workoutState: emptyTrainingData(),
    trainingType: 'Силовая',
    trainingDate: todayLocalIso(),
    client: null,
    completeInFlight: false,
  })
  const persistRef = useRef(/** @type {null | Function} */ (null))
  const durableWriteTimerRef = useRef(null)

  // Без getAll по всем stores — на слабом планшете полный scan душил «Закончить».
  const syncOutbound = useSyncOutboundPoll({
    enabled: loadState === 'ok' && !completeBusy,
    queueOnly: true,
    debounceMs: 1600,
  })

  const runExclusive = useCallback(async (fn) => {
    const next = saveMutexRef.current.then(fn, fn)
    saveMutexRef.current = next.catch(() => {})
    return next
  }, [])

  liveDraftRef.current = {
    loadState,
    isNew,
    clientIdParam,
    meta,
    workoutState,
    trainingType,
    trainingDate,
    client,
    completeInFlight: completeInFlightRef.current,
  }

  const writeDurableFromLive = useCallback((live, revisedAt) => {
    const cid = live?.client?.id ?? live?.clientIdParam
    if (!cid) return false
    const tid = live?.meta?.trainingId
    return putTrainingDraftDurable(
      { trainingId: tid, clientId: cid, isNew: live?.isNew || !tid },
      {
        trainingId: tid,
        clientId: cid,
        status: live?.meta?.status,
        trainingType: live?.trainingType,
        trainingDate: live?.trainingDate,
        workoutState: live?.workoutState,
        trainerId: live?.client?.trainer_id ?? user?.id ?? null,
        clubId: live?.client?.club_id ?? user?.club_id ?? null,
        revisedAt: revisedAt || new Date().toISOString(),
      },
    )
  }, [user?.id, user?.club_id])

  /** Синхронно в ref — переживает уход на главную до re-render (последний символ в textarea). */
  const applyWorkoutState = useCallback((updater) => {
    const prev = liveDraftRef.current.workoutState ?? emptyTrainingData()
    const next = typeof updater === 'function' ? updater(prev) : updater
    liveDraftRef.current = { ...liveDraftRef.current, workoutState: next }
    setWorkoutState(next)
  }, [])

  const flushDraftSnapshotOnLeave = useCallback(() => {
    const outgoing = draftSessionGateRef.current
    if (outgoing?.id && isTrainingDraftSessionSnapshotReady(outgoing.snap, outgoing.id)) {
      putTrainingDraftSession(outgoing.id, outgoing.snap)
    }
    writeDurableFromLive(liveDraftRef.current)
  }, [writeDurableFromLive])

  const onHideFlush = useCallback((_live) => {
    flushDraftSnapshotOnLeave()
    userEditedRef.current = true
    const persistFn = persistRef.current
    if (typeof persistFn === 'function') {
      void persistFn('draft', { silent: true, skipNavigate: true, fromHide: true })
    }
  }, [flushDraftSnapshotOnLeave])

  useTrainingDraftHideFlush({
    enabled: loadState === 'ok' && Boolean(user?.id) && !isTrainingStatusCompleted(meta.status),
    liveRef: liveDraftRef,
    onHideFlush,
  })

  useEffect(() => {
    if (loadState !== 'ok') return undefined
    if (isTrainingStatusCompleted(meta.status)) return undefined
    return registerTrainingDraftUpdateFlush(async () => {
      const live = liveDraftRef.current
      writeDurableFromLive(live)
      userEditedRef.current = true
      const persistFn = persistRef.current
      if (typeof persistFn === 'function') {
        await persistFn('draft', { silent: true, skipNavigate: true, fromHide: true })
      }
    })
  }, [loadState, meta.status, writeDurableFromLive])

  const applyDraftSessionSnapshot = useCallback((snap) => {
    setMeta({
      status: snap.meta?.status ?? 'draft',
      trainingId: snap.meta?.trainingId ?? null,
    })
    setWorkoutState(snap.workoutState && typeof snap.workoutState === 'object' ? snap.workoutState : emptyTrainingData())
    setTrainingType(snap.trainingType || 'Силовая')
    setTrainingDate(snap.trainingDate || todayLocalIso())
    setClient(snap.client ?? null)
    setHealthCard(snap.healthCard ?? null)
    setContra(String(snap.contra ?? ''))
    setMembershipSummary(snap.membershipSummary ?? null)
    setOtherCompletedTrainings(Number(snap.otherCompletedTrainings) || 0)
    setEarlyActivateProposal(null)
    setMembershipShiftMode(null)
    setLateDraftOffer(false)
    setLateBlockedNotice(String(snap.lateBlockedNotice ?? ''))
    lateShiftDismissedRef.current = false
    draftTrainingIdRef.current = snap.meta?.trainingId ?? null
    pendingHrScopeRef.current = null
    setSaveError('')
    setAutosaveStatus('idle')
    setLoadState('ok')
  }, [])

  /** До paint: уходящий черновик в LRU; при hit — сразу свой UI (без кадра чужих упражнений). */
  useLayoutEffect(() => {
    if (!user?.id) return
    if (isNew && isAdmin) return

    const outgoing = draftSessionGateRef.current
    if (outgoing?.id && outgoing.id !== id && isTrainingDraftSessionSnapshotReady(outgoing.snap, outgoing.id)) {
      putTrainingDraftSession(outgoing.id, outgoing.snap)
    }

    if (isNew || !id || id === 'new') {
      sessionCacheHitRef.current = null
      return
    }

    const cachedEntry = takeTrainingDraftSessionEntry(id)
    const cached = cachedEntry?.snapshot
    if (!isTrainingDraftSessionSnapshotReady(cached, { trainingId: id })) {
      sessionCacheHitRef.current = null
      setLoadState('loading')
      setWorkoutState(emptyTrainingData())
      // Сбрасываем meta, иначе кадр «URL=B, meta=A» рисует чужие упражнения.
      setMeta({ status: 'draft', trainingId: null })
      return
    }

    const epoch = pageEpochRef.current + 1
    pageEpochRef.current = epoch
    sessionCacheHitRef.current = {
      id: String(id),
      epoch,
      clientId: String(cached.client?.id ?? ''),
      clubId: String(cached.client?.club_id ?? ''),
      status: String(cached.meta?.status ?? 'draft'),
      trainingDate: String(cached.trainingDate ?? ''),
      trainingType: String(cached.trainingType ?? 'Силовая'),
      sessionAt: cachedEntry?.at ?? 0,
    }
    applyDraftSessionSnapshot(cached)
    bumpHydrateVersion((v) => v + 1)
  }, [id, clientIdParam, isNew, isAdmin, user?.id, applyDraftSessionSnapshot])

  // Пока на вкладке — держим свежий снимок (последний кейстрок уйдёт в LRU при уходе).
  useLayoutEffect(() => {
    if (
      !isTrainingDraftUiAligned({
        loadState,
        routeId: id,
        metaTrainingId: meta.trainingId,
        isNew,
        clientId: client?.id ?? clientIdParam,
      })
    ) {
      return
    }
    const tid = String(meta.trainingId ?? '').trim()
    const snap = buildTrainingDraftSessionSnapshot({
      loadState,
      meta,
      workoutState,
      trainingType,
      trainingDate,
      client,
      healthCard,
      contra,
      membershipSummary,
      otherCompletedTrainings,
      lateBlockedNotice,
    })
    if (!snap) return
    draftSessionGateRef.current = { id: tid, snap }
  }, [
    id,
    isNew,
    clientIdParam,
    loadState,
    meta,
    workoutState,
    trainingType,
    trainingDate,
    client,
    healthCard,
    contra,
    membershipSummary,
    otherCompletedTrainings,
    lateBlockedNotice,
  ])

  useEffect(() => {
    return () => {
      flushDraftSnapshotOnLeave()
    }
  }, [flushDraftSnapshotOnLeave])

  const load = useCallback(async () => {
    if (!user?.id) return
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (autosaveUiTimerRef.current) {
      clearTimeout(autosaveUiTimerRef.current)
      autosaveUiTimerRef.current = null
    }

    // Layout уже восстановил вкладку из LRU — не затираем IDB-load'ом.
    const cacheHit = sessionCacheHitRef.current
    if (cacheHit && cacheHit.id === String(id ?? '') && !isNew) {
      const epoch = cacheHit.epoch
      const cid = String(cacheHit.clientId ?? '').trim()
      if (!cid) return
      try {
        const ms = await loadTrainingMembershipTileSummary({
          clientId: cid,
          trainingId: String(id ?? ''),
          trainingDate: cacheHit.trainingDate,
          status: cacheHit.status,
          fallbackDate: todayLocalIso(),
        })
        if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
        setMembershipSummary(ms)
        if (!isAdmin && String(cacheHit.status ?? '') === 'draft') {
          const gateDay = String(cacheHit.trainingDate || todayLocalIso()).slice(0, 10)
          const lateInsp = await loadLateStartInspection(cid, gateDay)
          if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
          if (lateInsp.status === 'offer' && lateInsp.proposal) {
            setEarlyActivateProposal(lateInsp.proposal)
            setMembershipShiftMode('late')
            setLateDraftOffer(true)
            setLateBlockedNotice('')
          } else if (lateInsp.status === 'blocked') {
            setEarlyActivateProposal(null)
            setMembershipShiftMode(null)
            setLateDraftOffer(false)
            setLateBlockedNotice(lateInsp.message || '')
          } else {
            setEarlyActivateProposal(null)
            setMembershipShiftMode(null)
            setLateDraftOffer(false)
            setLateBlockedNotice('')
          }
        }
        prefetchTrainerClientWorkspace(cid, {
          trainerId: isAdmin ? '' : user.id,
          clubId: cacheHit.clubId || '',
        })
        const dbCached = await getDb()
        if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
        const idbRowCached = await dbCached.get('trainings', String(id ?? ''))
        const durableCached = readTrainingDraftDurable({ trainingId: id, clientId: cid })
        const sessionEntry = peekTrainingDraftSessionEntry(id)
        const sessionSnap = sessionEntry?.snapshot
        const pickedCached = pickTrainingDraftRestore({
          idbRow: idbRowCached,
          durable: durableCached,
          session: sessionSnap
            ? {
                workoutState: sessionSnap.workoutState,
                trainingType: sessionSnap.trainingType,
                trainingDate: sessionSnap.trainingDate,
                revisionMs: sessionEntry?.at ?? cacheHit.sessionAt ?? 0,
              }
            : null,
        })
        const cacheWs = sessionSnap?.workoutState ?? {}
        const idbWs = idbRowCached?.data && typeof idbRowCached.data === 'object' ? idbRowCached.data : {}
        const shownScore = workoutDraftContentScore(cacheWs)
        const pickedScore = workoutDraftContentScore(pickedCached.workoutState)
        if (pickedCached.source !== 'empty' && pickedScore > shownScore && pickedScore >= workoutDraftContentScore(idbWs)) {
          const fallbackType = pickedCached.trainingType || cacheHit.trainingType || 'Силовая'
          setWorkoutState({
            ...emptyTrainingData(),
            ...sanitizeWorkoutData(pickedCached.workoutState, { sessionFallback: fallbackType }),
          })
          if (pickedCached.trainingType) setTrainingType(pickedCached.trainingType)
          if (pickedCached.trainingDate) {
            setTrainingDate(
              canEditTrainingDate(isAdmin, 'draft')
                ? String(pickedCached.trainingDate)
                : clampIsoDateToToday(String(pickedCached.trainingDate)),
            )
          }
          userEditedRef.current = true
          window.setTimeout(() => {
            if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
            void persistRef.current?.('draft', { silent: true, skipNavigate: true })
          }, 80)
        }
      } catch {
        /* экран уже из кэша */
      }
      return
    }

    const outgoing = draftSessionGateRef.current
    if (outgoing?.id && outgoing.id !== id && isTrainingDraftSessionSnapshotReady(outgoing.snap, outgoing.id)) {
      putTrainingDraftSession(outgoing.id, outgoing.snap)
    }

    const epoch = pageEpochRef.current + 1
    pageEpochRef.current = epoch
    setSaveError('')
    setAutosaveStatus('idle')
    setLoadState('loading')
    // Не показывать упражнения предыдущего черновика, пока грузится текущий.
    setWorkoutState(emptyTrainingData())
    if (isNew) {
      if (!clientIdParam) {
        if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
        setLoadState('missing')
        return
      }
      const c = await getLocalClient(clientIdParam)
      if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
      setClient(c ?? null)
      const hc = await getHealthCard(clientIdParam)
      if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
      setHealthCard(hc ?? null)
      setContra((hc?.contraindications ?? '').trim())
      const trainings = await listTrainingsForClient(clientIdParam)
      if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
      const prefilled = emptyTrainingData()
      const fromPrior = suggestTrainingPreWeightInput(hc, trainings)
      if (fromPrior) prefilled.pre_weight_kg = fromPrior
      let workoutNew = prefilled
      let typeNew = 'Силовая'
      let dateNew = todayLocalIso()
      const durableNew = readTrainingDraftDurable({ clientId: clientIdParam, isNew: true })
      // Уже был первый save (/new→uuid), но URL не успел смениться до kill вкладки.
      const durableTid = String(durableNew?.trainingId ?? '').trim()
      if (durableTid) {
        const dbNew = await getDb()
        if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
        const existing = await dbNew.get('trainings', durableTid)
        if (
          existing &&
          String(existing.client_id ?? '') === String(clientIdParam) &&
          String(existing.status ?? '') !== 'completed'
        ) {
          if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
          const clubQ = search.get('club')
          const qs = clubQ
            ? `?clientId=${encodeURIComponent(clientIdParam)}&club=${encodeURIComponent(clubQ)}`
            : `?clientId=${encodeURIComponent(clientIdParam)}`
          nav(`${workoutsBase}/${durableTid}${qs}`, { replace: true })
          return
        }
        migrateTrainingDraftDurableNewToId(clientIdParam, durableTid)
      }
      const pickedNew = pickTrainingDraftRestore({ durable: durableNew })
      if (pickedNew.source === 'durable') {
        workoutNew = {
          ...emptyTrainingData(),
          ...sanitizeWorkoutData(pickedNew.workoutState, {
            sessionFallback: pickedNew.trainingType || durableNew?.trainingType || 'Силовая',
          }),
        }
        if (pickedNew.trainingType || durableNew?.trainingType) {
          typeNew = pickedNew.trainingType || durableNew.trainingType
        }
        if (pickedNew.trainingDate || durableNew?.trainingDate) {
          dateNew = String(pickedNew.trainingDate || durableNew.trainingDate).slice(0, 10)
        }
      }
      setWorkoutState(workoutNew)
      setTrainingType(typeNew)
      setTrainingDate(dateNew)
      setMeta({ status: 'draft', trainingId: null })
      setOtherCompletedTrainings(
        trainings.filter((t) => String(t?.status ?? '') === 'completed').length,
      )
      const ms = await loadTrainingMembershipTileSummary({
        clientId: clientIdParam,
        allTrainings: trainings,
        trainingDate: dateNew,
        status: 'draft',
        fallbackDate: todayLocalIso(),
      })
      if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
      setMembershipSummary(ms)
      draftTrainingIdRef.current = null
      // pending scope создаёт bind-эффект; не сбрасываем тут при каждом load —
      // иначе mid-workout reload load() сотрёт буфер до первого save.
      if (!c) {
        setEarlyActivateProposal(null)
        setMembershipShiftMode(null)
        setLateBlockedNotice('')
        setLateDraftOffer(false)
        lateShiftDismissedRef.current = false
        setLoadState('missing')
        return
      }
      lateShiftDismissedRef.current = false
      setLateDraftOffer(false)
      if (!ms) {
        const offer = await loadEarlyActivationProposal(clientIdParam, todayLocalIso())
        if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
        if (offer.ok && offer.proposal) {
          setEarlyActivateProposal(offer.proposal)
          setMembershipShiftMode('early')
          setLateBlockedNotice('')
          setLoadState('awaiting_activate')
        } else {
          setEarlyActivateProposal(null)
          setMembershipShiftMode(null)
          setLateBlockedNotice('')
          setLoadState('no_membership')
        }
        return
      }
      const lateInsp = await loadLateStartInspection(clientIdParam, todayLocalIso())
      if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
      if (lateInsp.status === 'offer' && lateInsp.proposal) {
        setEarlyActivateProposal(lateInsp.proposal)
        setMembershipShiftMode('late')
        setLateBlockedNotice('')
        setLoadState('awaiting_activate')
        return
      }
      setEarlyActivateProposal(null)
      setMembershipShiftMode(null)
      setLateBlockedNotice(lateInsp.status === 'blocked' ? lateInsp.message || '' : '')
      prefetchTrainerClientWorkspace(clientIdParam, {
        trainerId: isAdmin ? '' : user.id,
        clubId: c?.club_id ?? '',
      })
      setLoadState('ok')
      bumpHydrateVersion((v) => v + 1)
      return
    }

    const db = await getDb()
    if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
    const t = await db.get('trainings', id)
    if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
    if (!t) {
      setClient(null)
      setMeta({ status: 'draft', trainingId: null })
      draftTrainingIdRef.current = null
      setMembershipSummary(null)
      setLateBlockedNotice('')
      setLateDraftOffer(false)
      setLoadState('missing')
      return
    }

    const sessionType = t.type && TRAINING_TYPES.includes(t.type) ? t.type : 'Силовая'
    const w = typeof t.data === 'object' && t.data ? sanitizeWorkoutData(t.data, { sessionFallback: sessionType }) : {}
    const today = todayLocalIso()
    const loaded = t.date ?? today

    // Параллельно: клиент / медкарта / дневник / абоны — меньше «Загрузка…» на первом заходе.
    const [c, hc, trainings, memberships] = await Promise.all([
      getLocalClient(t.client_id),
      getHealthCard(t.client_id),
      listTrainingsForClient(t.client_id),
      listMemberships(t.client_id),
    ])
    if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
    const membershipSummary = buildTrainingMembershipTileSummary({
      memberships,
      allTrainings: trainings,
      training: t,
      trainingDate: loaded,
      status: t.status,
      fallbackDate: today,
    })

    let earlyActivateProposalNext = null
    let membershipShiftModeNext = null
    let lateDraftOfferNext = false
    let lateBlockedNoticeNext = ''
    if (!isAdmin && String(t.status ?? '') === 'draft') {
      const gateDay = String(loaded ?? today).slice(0, 10)
      const lateInsp = await loadLateStartInspection(t.client_id, gateDay)
      if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
      if (lateInsp.status === 'offer' && lateInsp.proposal) {
        earlyActivateProposalNext = lateInsp.proposal
        membershipShiftModeNext = 'late'
        lateDraftOfferNext = true
      } else if (lateInsp.status === 'blocked') {
        lateBlockedNoticeNext = lateInsp.message || ''
      }
    }
    if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return

    // Все setState после awaits — иначе устаревший load пишет чужой workout на новый URL.
    let trainingDateNext = canEditTrainingDate(isAdmin, t.status) ? loaded : clampIsoDateToToday(loaded)
    let sessionTypeNext = sessionType
    let workoutNext = { ...emptyTrainingData(), ...w }
    let statusNext = t.status
    let restoredFromBestDraft = false
    if (String(t.status ?? '') === 'draft') {
      const durable = readTrainingDraftDurable({ trainingId: t.id, clientId: t.client_id })
      const sessionEntry = peekTrainingDraftSessionEntry(t.id)
      const sessionSnap = sessionEntry?.snapshot
      const picked = pickTrainingDraftRestore({
        idbRow: t,
        durable,
        session: sessionSnap
          ? {
              workoutState: sessionSnap.workoutState,
              trainingType: sessionSnap.trainingType,
              trainingDate: sessionSnap.trainingDate,
              revisionMs: sessionEntry?.at ?? 0,
            }
          : null,
      })
      if (picked.source !== 'empty' && picked.source !== 'idb') {
        restoredFromBestDraft = true
      } else if (
        picked.source === 'idb' &&
        workoutDraftContentScore(picked.workoutState) > workoutDraftContentScore(w)
      ) {
        restoredFromBestDraft = true
      }
      if (picked.source !== 'empty') {
        workoutNext = {
          ...emptyTrainingData(),
          ...sanitizeWorkoutData(picked.workoutState, {
            sessionFallback: picked.trainingType || sessionType,
          }),
        }
        if (picked.trainingType) sessionTypeNext = picked.trainingType
        if (picked.trainingDate) {
          trainingDateNext = canEditTrainingDate(isAdmin, 'draft')
            ? String(picked.trainingDate)
            : clampIsoDateToToday(String(picked.trainingDate))
        }
        statusNext = 'draft'
      }
    }
    const otherCompletedNext = trainings.filter(
      (tr) => String(tr?.status ?? '') === 'completed' && tr.id !== t.id,
    ).length
    const contraNext = (hc?.contraindications ?? '').trim()

    setMeta({ status: statusNext, trainingId: t.id })
    setClient(c)
    setWorkoutState(workoutNext)
    setTrainingType(sessionTypeNext)
    setTrainingDate(trainingDateNext)
    setHealthCard(hc ?? null)
    setContra(contraNext)
    setOtherCompletedTrainings(otherCompletedNext)
    setMembershipSummary(membershipSummary)
    draftTrainingIdRef.current = t.id
    pendingHrScopeRef.current = null
    setEarlyActivateProposal(earlyActivateProposalNext)
    setMembershipShiftMode(membershipShiftModeNext)
    setLateDraftOffer(lateDraftOfferNext)
    setLateBlockedNotice(lateBlockedNoticeNext)
    lateShiftDismissedRef.current = false

    prefetchTrainerClientWorkspace(t.client_id, {
      trainerId: isAdmin ? '' : user.id,
      clubId: c?.club_id ?? t.club_id ?? '',
    })
    setLoadState('ok')
    bumpHydrateVersion((v) => v + 1)

    putTrainingDraftSession(
      t.id,
      buildTrainingDraftSessionSnapshot({
        loadState: 'ok',
        meta: { status: statusNext, trainingId: t.id },
        workoutState: workoutNext,
        trainingType: sessionTypeNext,
        trainingDate: trainingDateNext,
        client: c,
        healthCard: hc ?? null,
        contra: contraNext,
        membershipSummary,
        otherCompletedTrainings: otherCompletedNext,
        lateBlockedNotice: lateBlockedNoticeNext,
      }),
    )

    if (restoredFromBestDraft) {
      window.setTimeout(() => {
        if (!isTrainingDraftEpochCurrent(pageEpochRef.current, epoch)) return
        userEditedRef.current = true
        void persistRef.current?.('draft', { silent: true, skipNavigate: true })
      }, 80)
    }
  }, [user?.id, isNew, clientIdParam, id, isAdmin, applyDraftSessionSnapshot, nav, search, workoutsBase])

  useEffect(() => {
    if (isNew && isAdmin) return
    void load()
  }, [load, isNew, isAdmin])

  /** Первый заход в форму: штамп старта сессии. Повтор / uuid — тот же ISO. ТЗ/АЗ/открытый ПНК — не куш. */
  useEffect(() => {
    if (loadState !== 'ok') return
    if (isTrainingStatusCompleted(meta.status)) return
    if (!isLoyaltyProgramClient(client)) return
    const now = new Date().toISOString()
    setWorkoutState((w) => {
      const kept = ensureLoyaltySessionStartedAt(w?.loyalty?.session_started_at, now)
      if (!kept) return w
      if (w?.loyalty?.session_started_at === kept) return w
      const prevStamp = w?.loyalty && typeof w.loyalty === 'object' ? w.loyalty : {}
      return { ...w, loyalty: { ...prevStamp, session_started_at: kept } }
    })
  }, [hydrateVersion, loadState, meta.status, client])

  /** Смена URL-тренировки / клиента — новый scope пульса (не путать черновики). */
  useEffect(() => {
    pendingHrScopeRef.current = null
  }, [id, clientIdParam])

  /** Сохранение тренировки. `silent=true` для автосохранения (не показывает “Сохранено”). */
  const persist = async (status, opts = {}) => {
    const silent = opts.silent === true
    const skipNavigate = opts.skipNavigate === true
    const fromHide = opts.fromHide === true
    const persistEpoch = pageEpochRef.current
    // Silent / hide: всегда актуальный снимок из ref (не stale closure от debounce/effect).
    const live = liveDraftRef.current
    const workoutState = live.workoutState
    const trainingType = live.trainingType
    const trainingDate = live.trainingDate
    const metaLive = live.meta
    const clientLive = live.client
    const clientIdParamLive = live.clientIdParam
    const isNewLive = live.isNew
    const completeClick = String(status ?? '') === 'completed' && !silent
    if (completeClick && shouldSkipDuplicateCompleteClick(completeInFlightRef.current)) return
    if (shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlightRef.current)) {
      setAutosaveStatus('idle')
      return
    }
    if (completeClick) {
      completeInFlightRef.current = true
      setCompleteBusy(true)
      setBackgroundSyncPaused(true)
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
      if (autosaveUiTimerRef.current) {
        clearTimeout(autosaveUiTimerRef.current)
        autosaveUiTimerRef.current = null
      }
      setAutosaveStatus('idle')
    }
    try {
    if (!silent) {
      setSaveError('')
      setSaveNotice('')
    } else {
      // автосэйв не должен оставлять “залипшую” ошибку после успешной попытки
      setSaveError('')
    }
    if (!user?.id) return
    if (
      shouldBlockMismatchedDraftPersist({
        silent,
        routeId: id,
        metaTrainingId: metaLive.trainingId,
      })
    ) {
      if (silent) setAutosaveStatus('idle')
      return
    }
    if (shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlightRef.current)) {
      setAutosaveStatus('idle')
      return
    }
    let trainingId = resolveTrainingPersistTargetId({
      routeId: id,
      metaTrainingId: metaLive.trainingId,
      draftRefId: draftTrainingIdRef.current,
    })
    if (!trainingId) {
      trainingId = crypto.randomUUID()
      draftTrainingIdRef.current = trainingId
      // meta только если экран ещё этот черновик — иначе чужая вкладка получит чужой id
      if (shouldApplyTrainingPersistUi({ currentEpoch: pageEpochRef.current, persistEpoch })) {
        setMeta((m) => ({ ...m, trainingId }))
      }
    }
    const cid = clientLive?.id ?? clientIdParamLive
    if (!cid) {
      if (silent) setAutosaveStatus('idle')
      if (!silent) setSaveError('Не выбран клиент')
      return
    }
    if (!trainingDate) {
      if (silent) setAutosaveStatus('idle')
      if (!silent) setSaveError('Укажите дату тренировки')
      return
    }

    // Hide: синхронный durable до любого await — переживает freeze вкладки.
    if (fromHide || silent) {
      writeDurableFromLive(
        {
          ...live,
          meta: { ...metaLive, trainingId },
          workoutState,
          trainingType,
          trainingDate,
          client: clientLive ?? { id: cid },
          clientIdParam: clientIdParamLive,
          isNew: isNewLive,
        },
        new Date().toISOString(),
      )
    }

    const db = await getDb()
    if (shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlightRef.current)) {
      setAutosaveStatus('idle')
      return
    }
    let prev = trainingId ? await db.get('trainings', trainingId) : null

    const previousStatus = prev?.status ?? metaLive.status
    const nextStatus = resolveTrainingPersistStatus(status, previousStatus)
    const firstCompletion = isTrainingFirstCompletion(previousStatus, nextStatus)
    if (firstCompletion && !silent) {
      // Уже посчитано при load — повторный listTrainings на слабом планшете душит «Закончить».
      const isFirstCompletion = otherCompletedTrainings === 0
      const hc = healthCard ?? (await getHealthCard(cid))
      const blockers = getTrainingCompletionIssues(workoutState, { health: hc, isFirstCompletion })
      if (blockers.length > 0) {
        if (shouldApplyTrainingPersistUi({ currentEpoch: pageEpochRef.current, persistEpoch })) {
          setShowCompletionHints(true)
          setSaveError('')
          setSaveNotice('')
        }
        return
      }
    }

    const today = todayLocalIso()
    const now = new Date().toISOString()

    // Для тренера: при первом завершении — «сегодня»; у уже завершённой — выбранная дата.
    const saveWithChosenDate = canEditTrainingDate(
      isAdmin,
      isTrainingStatusCompleted(prev?.status) || isTrainingStatusCompleted(metaLive.status)
        ? 'completed'
        : 'draft',
    )
    const effectiveDate = saveWithChosenDate ? trainingDate : today
    if (nextStatus === 'completed' && !silent && isIsoDateAfterToday(effectiveDate)) {
      setSaveError('Нельзя завершить тренировку датой в будущем. Проверьте дату на устройстве.')
      return
    }

    // Черновик / повторный вход: не завершать первую тренировку, пока не решён сдвиг срока.
    // Только если у клиента ещё не было completed (иначе late-offer не нужен).
    if (
      firstCompletion &&
      !silent &&
      !isAdmin &&
      !lateShiftDismissedRef.current &&
      otherCompletedTrainings === 0
    ) {
      const lateCheck = await loadLateStartProposal(cid, effectiveDate)
      if (lateCheck.ok && lateCheck.proposal) {
        setEarlyActivateProposal(lateCheck.proposal)
        setMembershipShiftMode('late')
        setLateDraftOffer(true)
        setEarlyActivateError('')
        setEarlyActivateOpen(true)
        setSaveError(
          'Абонемент стартовал раньше первой тренировки. Сдвиньте срок или продолжите без сдвига — затем снова нажмите «Завершить».',
        )
        return
      }
      if (lateCheck.inspection?.status === 'blocked' && lateCheck.inspection.message) {
        setLateBlockedNotice(lateCheck.inspection.message)
      }
    }

    if (shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlightRef.current)) {
      setAutosaveStatus('idle')
      return
    }

    // club_id обязателен для записи. В dev/локальном режиме можно восстановить его
    // из предыдущей тренировки/абонемента/первого клуба, если в карточке клиента он не заполнен.
    let club_id = clientLive?.club_id ?? prev?.club_id ?? null
    if (!club_id) {
      try {
        const mems = await listMemberships(cid)
        club_id = mems?.find((m) => m.club_id)?.club_id ?? null
      } catch {
        // ignore
      }
    }
    if (!club_id) {
      try {
        const clubs = await listClubsLocal()
        club_id = clubs?.[0]?.id ?? null
      } catch {
        // ignore
      }
    }
    if (!club_id) {
      if (silent) setAutosaveStatus('error')
      if (!silent) setSaveError('Не удалось определить club_id (нет клуба у клиента). Добавьте клуб или привяжите клиента к клубу.')
      return
    }

    const stampLoyalty = firstCompletion && isLoyaltyProgramClient(clientLive)
    const loyaltySettingsPromise = stampLoyalty
      ? loadLoyaltyCompleteSettings(club_id).catch(() => null)
      : Promise.resolve(null)

    const wm = parseInt(String(workoutState.warmup_duration_min ?? ''), 10) || 0
    const cm = parseInt(String(workoutState.cooldown_duration_min ?? ''), 10) || 0

    const dataPayload = {
      ...sanitizeWorkoutData(workoutState, { sessionFallback: trainingType }),
      duration_min: wm + cm > 0 ? wm + cm : workoutState.duration_min ?? '',
    }
    let hrSnap = null
    try {
      hrSnap = pickHrSessionForPersist({
        firstCompletion,
        liveSummary: hr.summarizeSession(cid, {
          birthDate: clientLive?.birth_date,
          sex: getHealthSex(healthCard),
          weightKg: workoutState.pre_weight_kg || healthCard?.weight_kg || null,
          asOfIso: effectiveDate || today,
        }),
        storedSnapshot: dataPayload.hr_session,
      })
    } catch (e) {
      // HR — не критический блокер завершения: сохраняем тренировку без HR-снапшота.
      recordAppError({
        source: 'app',
        error: 'Ошибка сохранения HR-снимка',
        context: `Завершение тренировки (training-persist) · hrSnap`,
        detail: e?.stack,
      })
    }
    if (hrSnap) dataPayload.hr_session = hrSnap
    else delete dataPayload.hr_session

    const persistType = deriveTrainingTypeFromExercises(dataPayload.exercises, trainingType)

    // Списание тренировки с абонемента: только при ПЕРВОМ переводе в completed.
    // Повторное "Завершить" после редактирования не меняет used_trainings.
    // Сначала сохраняем completed-тренировку, потом debit (если save упадёт — used не растёт зря).
    let membershipToDebit = null
    if (firstCompletion) {
      const debitPlan = await resolveMembershipForFirstCompletionDebit(cid, effectiveDate)
      if (!debitPlan.ok) {
        if (silent) setAutosaveStatus('error')
        if (!silent) setSaveError(debitPlan.message)
        return
      }
      membershipToDebit = debitPlan.membership
      dataPayload.membership_id = debitPlan.membershipId
    }
    if (nextStatus === 'completed' && !String(dataPayload.membership_id ?? '').trim()) {
      try {
        const mems = await listMemberships(cid)
        const linked = ensureTrainingDataMembershipId(
          { client_id: cid, date: effectiveDate, data: dataPayload },
          mems,
        )
        const mid = String(linked?.data?.membership_id ?? '').trim()
        if (mid) dataPayload.membership_id = mid
      } catch {
        /* статистика подставит тип по дате */
      }
    }
    let loyaltySamples = []
    if (stampLoyalty) {
      try {
        loyaltySamples = hr.getSessionSamples(cid) ?? []
      } catch {
        loyaltySamples = []
      }
    }
    const loyaltySettings = stampLoyalty
      ? await Promise.race([
          loyaltySettingsPromise,
          new Promise((resolve) => {
            setTimeout(() => resolve(null), LOYALTY_COMPLETE_SETTINGS_WAIT_MS)
          }),
        ])
      : null
    if (shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlightRef.current)) {
      setAutosaveStatus('idle')
      return
    }
    let dataWithLoyalty = dataPayload
    if (stampLoyalty) {
      try {
        dataWithLoyalty = applyLoyaltyOnTrainingPersist({
          data: dataPayload,
          type: persistType,
          firstCompletion,
          nowIso: now,
          samples: loyaltySamples,
          health: {
            birthDate: clientLive?.birth_date,
            sex: getHealthSex(healthCard),
            weightKg: workoutState.pre_weight_kg || healthCard?.weight_kg || null,
            asOfIso: effectiveDate || today,
          },
          settings: loyaltySettings,
        })
      } catch (e) {
        // Loyalty — тоже не критический блокер: сохраняем тренировку без штампа.
        recordAppError({
          source: 'app',
          error: 'Ошибка сохранения штампа лояльности',
          context: `Завершение тренировки (training-persist) · loyalty`,
          detail: e?.stack,
        })
      }
    }
    const trainerIdForRow = isAdmin ? prev?.trainer_id ?? clientLive?.trainer_id ?? user.id : user.id
    const row = {
      id: prev?.id ?? trainingId,
      client_id: cid,
      trainer_id: trainerIdForRow,
      club_id,
      date:
        nextStatus === 'completed'
          ? effectiveDate
          : isAdmin
            ? trainingDate
            : today,
      type: persistType,
      status: nextStatus,
      data: dataWithLoyalty,
      created_at: prev?.created_at ?? now,
      synced: false,
    }
    await runExclusive(async () => {
      if (shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlightRef.current)) {
        setAutosaveStatus('idle')
        return
      }
      const dbNow = await getDb()
      const fresh = await dbNow.get('trainings', row.id)
      const diskStatus = fresh?.status ?? previousStatus
      if (shouldSkipSilentPersistOfCompleted(diskStatus, silent)) return
      if (shouldSkipDuplicateFirstCompletionSave(diskStatus, firstCompletion)) {
        const applyUi = shouldApplyTrainingPersistUi({
          currentEpoch: pageEpochRef.current,
          persistEpoch,
        })
        if (applyUi) {
          setMeta({ status: 'completed', trainingId: fresh?.id ?? row.id })
          if (!silent) {
            setSaveNotice('Тренировка завершена и сохранена.')
            setAutosaveStatus('idle')
          }
        }
        runTrainingCompleteFollowUp(cid)
        if (!skipNavigate) nav(`${clientsBase}/${cid}${preserveClubQs}`, { replace: true })
        return
      }
      const stillFirst = isTrainingFirstCompletion(diskStatus, row.status)
      const debitNow = Boolean(membershipToDebit) && stillFirst
      row.status = resolveTrainingPersistStatus(row.status, diskStatus)
      const applyUi = shouldApplyTrainingPersistUi({
        currentEpoch: pageEpochRef.current,
        persistEpoch,
      })
      if (silent) {
        if (shouldSkipSilentPersistWhileCompleteInFlight(true, completeInFlightRef.current)) {
          setAutosaveStatus('idle')
          return
        }
        if (applyUi) setAutosaveStatus('saving')
      }
      try {
        await saveLocalWithSync('trainings', row, {
          table_name: 'trainings',
          operation: prev ? 'update' : 'insert',
          remote_id: prev ? row.id : null,
        })
      } catch (e) {
        if (applyUi) {
          if (!silent) setSaveError(e?.message ?? 'Ошибка сохранения')
          if (silent) setAutosaveStatus('error')
        }
        return
      }

      // /new → uuid: место формы (шаг/упражнение) не сбрасывать.
      if (cid && row.id && (isNewLive || id === 'new')) {
        migrateTrainingFormPlace(
          resolveTrainingFormPlaceKey({ routeId: 'new', clientId: cid }),
          row.id,
        )
        migrateTrainingDraftDurableNewToId(cid, row.id)
      }

      if (debitNow) {
        try {
          await applyMembershipFirstCompletionDebit(membershipToDebit)
        } catch (e) {
          if (applyUi) {
            if (silent) setAutosaveStatus('error')
            if (!silent) {
              setSaveError(
                e?.message ??
                  'Тренировка сохранена, но списание с абонемента не удалось — нажмите Sync или откройте вкладку абонементов',
              )
            }
          }
          // Тренировка уже completed; reconcile / повторное открытие абонов догонит used.
        }
      }

      if (applyUi) setMeta({ status: row.status, trainingId: row.id })
      try {
        if (stillFirst) {
          hr.endTrainingHrSession(cid)
          hr.disconnectClient(cid)
          pendingHrScopeRef.current = null
        } else if (row.status !== 'completed') {
          // Перенос буфера пульса — всегда (даже если уже другая вкладка); bind UI — только свой экран.
          const pending = pendingHrScopeRef.current
          if (pending && row.id && pending !== row.id) {
            hr.migrateTrainingScope(cid, pending, row.id)
            pendingHrScopeRef.current = null
          }
          if (applyUi && row.id) hr.bindTrainingScope(cid, row.id)
        }
      } catch {
        /* ignore */
      }
      const fpAfter = trainingContentFingerprint({
        clientId: cid,
        trainingType,
        trainingDate,
        status: row.status,
        workoutState,
      })
      // Пока шёл async save, тренер мог ввести ещё — не сбрасывать dirty по устаревшему fp.
      const liveNow = liveDraftRef.current
      const fpLiveNow = trainingContentFingerprint({
        clientId: liveNow.client?.id ?? liveNow.clientIdParam ?? cid,
        trainingType: liveNow.trainingType,
        trainingDate: liveNow.trainingDate,
        status: row.status,
        workoutState: liveNow.workoutState,
      })
      const stillDirtyAfterSave = fpLiveNow !== fpAfter
      if (applyUi) {
        if (!silent) {
          setSaveNotice(row.status === 'completed' ? 'Тренировка завершена и сохранена.' : 'Черновик сохранён.')
          userEditedRef.current = stillDirtyAfterSave
          baselineContentSnapshotRef.current = fpAfter
          setAutosaveStatus('idle')
          if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
        } else if (stillDirtyAfterSave || userEditedRef.current) {
          setAutosaveStatus(stillDirtyAfterSave ? 'idle' : 'saved')
          userEditedRef.current = stillDirtyAfterSave
          baselineContentSnapshotRef.current = fpAfter
          if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
          if (!stillDirtyAfterSave) {
            autosaveUiTimerRef.current = setTimeout(() => {
              setAutosaveStatus((cur) => (cur === 'saved' ? 'idle' : cur))
            }, 1400)
          }
        } else {
          // Автосэйв без «редактирования» (первый тик, flush, только tid): нельзя оставлять вечное «Сохранение…»
          baselineContentSnapshotRef.current = fpAfter
          if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
          setAutosaveStatus((cur) => (cur === 'saved' ? 'saved' : 'idle'))
        }
      }

      if (row.status === 'completed') {
        dropTrainingDraftSession(row.id)
        clearTrainingDraftDurable({ trainingId: row.id, clientId: cid })
        clearTrainingDraftDurable({ clientId: cid, isNew: true })
        runTrainingCompleteFollowUp(cid)
        const completedCount =
          otherCompletedTrainings + (prev?.status === 'completed' ? 0 : 1)
        if (!skipNavigate && shouldOfferMarkPnkTrialDone(clientLive, completedCount)) {
          // Сразу отмечаем шаг воронки — без лишнего вопроса «Позже»
          try {
            const deliverable =
              resolvePnkTrialDeliverableAfterWorkout(clientLive, Math.max(1, completedCount)) || 'trial'
            const patch =
              deliverable === 'trial'
                ? { stage: 'trial_done', deliverable: 'trial' }
                : { deliverable }
            const res = await patchPnkClientLocal(clientLive, patch)
            if (res.ok && applyUi) setClient(res.client)
          } catch {
            /* карточка всё равно откроется; шаг можно закрыть Далее в воронке */
          }
          nav(`${clientsBase}/${cid}${preserveClubQs}`, { replace: true })
          return
        }
        if (!skipNavigate) nav(`${clientsBase}/${cid}${preserveClubQs}`, { replace: true })
        return
      }

      // IDB догнал durable — можно сбросить мост; иначе оставить (ввод после старта save).
      if (!stillDirtyAfterSave) {
        const durableLeft = readTrainingDraftDurable({ trainingId: row.id, clientId: cid })
        if (
          shouldClearDurableAfterIdbSave({
            durable: durableLeft,
            idbUpdatedAt: row.updated_at,
            savedAt: now,
          })
        ) {
          clearTrainingDraftDurable({ trainingId: row.id, clientId: cid })
          clearTrainingDraftDurable({ clientId: cid, isNew: true })
        }
      }

      const shouldPromoteUrl =
        applyUi && row.status !== 'completed' && isNewLive && id === 'new' && cid
      const clubQ = search.get('club')
      const nextUrlClient = clubQ
        ? `?clientId=${encodeURIComponent(cid)}&club=${encodeURIComponent(clubQ)}`
        : `?clientId=${encodeURIComponent(cid)}`
      if (shouldPromoteUrl) {
        // После первого сохранения делаем URL стабильным (/workouts/:id), даже если автосэйв включён skipNavigate.
        nav(`${workoutsBase}/${row.id}${nextUrlClient}`, { replace: true })
      } else if (applyUi && !skipNavigate && row.status !== 'completed' && isNewLive) {
        nav(`${workoutsBase}/${row.id}${preserveClubQs}`, { replace: true })
      }
    })
    } catch (e) {
      const message = e?.message ? String(e.message) : 'Ошибка сохранения тренировки'
      recordAppError({
        source: 'app',
        error: message,
        context: `training-persist · ${String(status ?? '') || 'unknown'}`,
        detail: e?.stack,
      })
      if (silent) setAutosaveStatus('error')
      if (!silent) setSaveError(message)
    } finally {
      if (completeClick) {
        completeInFlightRef.current = false
        setCompleteBusy(false)
        setBackgroundSyncPaused(false)
      }
    }
  }

  persistRef.current = persist

  /** Автосохранение черновика локально при изменениях формы — чтобы не терять прогресс при уходе со страницы. */
  const contentFingerprint = useMemo(() => {
    return trainingContentFingerprint({
      clientId: client?.id ?? clientIdParam,
      trainingType,
      trainingDate,
      status: meta.status,
      workoutState,
    })
  }, [client?.id, clientIdParam, meta.status, trainingDate, trainingType, workoutState])

  const snapshotKey = useMemo(() => {
    return JSON.stringify({ hydrate: hydrateVersion, content: contentFingerprint })
  }, [hydrateVersion, contentFingerprint])

  useEffect(() => {
    if (loadState !== 'ok') return
    baselineContentSnapshotRef.current = contentFingerprint
    userEditedRef.current = false
    setAutosaveStatus('idle')
    if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
  }, [hydrateVersion, loadState])

  useEffect(() => {
    if (loadState !== 'ok') return
    if (baselineContentSnapshotRef.current && contentFingerprint !== baselineContentSnapshotRef.current) {
      userEditedRef.current = true
    }
  }, [contentFingerprint, loadState])

  useEffect(() => {
    if (loadState !== 'ok') return
    if (!user?.id) return
    if (meta.status === 'completed') return
    if (completeBusy) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
      return
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      if (completeInFlightRef.current) return
      void persist('draft', { silent: true, skipNavigate: true })
    }, 650)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [snapshotKey, loadState, user?.id, meta.status, completeBusy])

  useEffect(() => {
    if (loadState !== 'ok' || isTrainingStatusCompleted(meta.status)) {
      clearOpenTrainingDraft(meta.trainingId)
      return undefined
    }
    const tid = String(meta.trainingId ?? '').trim()
    if (!tid) return undefined
    setOpenTrainingDraft(tid, client?.id ?? clientIdParam)
    return () => clearOpenTrainingDraft(tid)
  }, [loadState, meta.status, meta.trainingId, client?.id, clientIdParam])

  // Throttle durable localStorage: даже без visibility (OEM) последние правки на диске.
  useEffect(() => {
    if (loadState !== 'ok') return
    if (isTrainingStatusCompleted(meta.status)) return
    if (!userEditedRef.current && contentFingerprint === baselineContentSnapshotRef.current) return
    if (durableWriteTimerRef.current) clearTimeout(durableWriteTimerRef.current)
    durableWriteTimerRef.current = setTimeout(() => {
      writeDurableFromLive(liveDraftRef.current)
    }, 280)
    return () => {
      if (durableWriteTimerRef.current) {
        clearTimeout(durableWriteTimerRef.current)
        durableWriteTimerRef.current = null
      }
      if (loadState === 'ok' && !isTrainingStatusCompleted(meta.status)) {
        writeDurableFromLive(liveDraftRef.current)
      }
    }
  }, [contentFingerprint, loadState, meta.status, writeDurableFromLive])

  const title = useMemo(() => {
    if (!client) return ''
    return client.name
  }, [client])

  const clientCardTrainingsHref = useMemo(() => {
    const cid = client?.id ?? clientIdParam
    if (!cid) return null
    const params = new URLSearchParams()
    const club = search.get('club')
    if (isAdmin && club) params.set('club', club)
    params.set('tab', 'diaries')
    const qs = params.toString()
    return `${clientsBase}/${cid}${qs ? `?${qs}` : ''}`
  }, [client?.id, clientIdParam, clientsBase, isAdmin, search])

  const daysUntilMembershipEnd = useMemo(() => {
    if (!membershipSummary?.endDate || !trainingDate) return null
    return calendarDaysUntil(trainingDate, membershipSummary.endDate)
  }, [membershipSummary, trainingDate])

  const completionIssues = useMemo(
    () =>
      getTrainingCompletionIssues(workoutState, {
        health: healthCard,
        isFirstCompletion: meta.status !== 'completed' && otherCompletedTrainings === 0,
      }),
    [workoutState, healthCard, meta.status, otherCompletedTrainings],
  )
  const canCompleteTraining = completionIssues.length === 0

  const [showCompletionHints, setShowCompletionHints] = useState(false)

  const nextCompletionHint = completionIssues[0] ?? null

  useEffect(() => {
    if (canCompleteTraining) setShowCompletionHints(false)
  }, [canCompleteTraining])

  useEffect(() => {
    if (!showCompletionHints) return
    const onKey = (e) => {
      if (e.key === 'Escape') setShowCompletionHints(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCompletionHints])

  const canChangeDate = canEditTrainingDate(isAdmin, meta.status)

  const hr = useHeartRateSessions()
  const clientKey = client?.id ?? clientIdParam ?? ''
  const hrSlot = hr.slotForClient(clientKey)
  const hrConnected = hrSlot?.status === 'live' || hrSlot?.status === 'connecting'
  const hrLost = hrSlot?.status === 'lost'
  const hrBusy = hrSlot?.status === 'connecting'
  const hrMaxHr = useMemo(() => {
    const age = ageYearsFromBirthDate(client?.birth_date, trainingDate || todayLocalIso())
    return estimateMaxHr(age) ?? undefined
  }, [client?.birth_date, trainingDate])
  const hrProfileHint = useMemo(() => {
    const weight = workoutState.pre_weight_kg || healthCard?.weight_kg || null
    return hrConnectProfileHint({
      birthDate: client?.birth_date,
      sex: getHealthSex(healthCard),
      weightKg: weight,
    })
  }, [client?.birth_date, healthCard, workoutState.pre_weight_kg])
  const membershipTileLabel = membershipSummary
    ? `${membershipSummary.current}/${membershipSummary.total}`
    : '—'
  const daysTileLabel =
    daysUntilMembershipEnd == null ? '—' : daysUntilMembershipEnd < 0 ? '0' : String(daysUntilMembershipEnd)

  /** Буфер пульса привязан к trainingId черновика — в завершённую не пишем. */
  useEffect(() => {
    if (loadState !== 'ok') return
    if (isTrainingStatusCompleted(meta.status)) return
    const cid = String(client?.id ?? clientIdParam ?? '').trim()
    if (!cid) return
    let tid = meta.trainingId || draftTrainingIdRef.current
    if (!tid || tid === 'new') {
      if (!pendingHrScopeRef.current) pendingHrScopeRef.current = crypto.randomUUID()
      tid = pendingHrScopeRef.current
    }
    hr.bindTrainingScope(cid, tid)
  }, [client?.id, clientIdParam, hr.bindTrainingScope, loadState, meta.trainingId, meta.status, id])

  const liveHrSummary = useMemo(() => {
    if (!clientKey || meta.status === 'completed') return null
    const samples = hr.getSessionSamples(clientKey)
    if (!samples.length) return null
    const weight = workoutState.pre_weight_kg || healthCard?.weight_kg || null
    return buildHrSessionSummary(samples, {
      birthDate: client?.birth_date,
      sex: getHealthSex(healthCard),
      weightKg: weight,
      asOfIso: trainingDate || todayLocalIso(),
    })
  }, [
    client?.birth_date,
    clientKey,
    healthCard,
    hr.getSessionSamples,
    hr.samplesEpoch,
    meta.status,
    trainingDate,
    workoutState.pre_weight_kg,
  ])

  // Черновик: только живые сэмплы этой тренировки. Завершённая: снимок из дневника.
  const displayHrSummary =
    meta.status === 'completed'
      ? normalizeHrSessionSnapshot(workoutState.hr_session)
      : liveHrSummary

  useEffect(() => {
    if (meta.status === 'completed') return
    if (liveHrSummary) {
      setWorkoutState((w) => {
        const prev = normalizeHrSessionSnapshot(w.hr_session)
        if (
          prev &&
          prev.avg === liveHrSummary.avg &&
          prev.max === liveHrSummary.max &&
          prev.min === liveHrSummary.min &&
          prev.samples_n === liveHrSummary.samples_n &&
          prev.kcal_est === liveHrSummary.kcal_est
        ) {
          return w
        }
        return { ...w, hr_session: liveHrSummary }
      })
      return
    }
    setWorkoutState((w) => {
      if (!w?.hr_session) return w
      const next = { ...w }
      delete next.hr_session
      return next
    })
  }, [liveHrSummary, meta.status])

  if (isNew && isAdmin) {
    return (
      <p className="muted">
        Новую тренировку «с нуля» может начать только тренер. <Link to={homeLink}>Надзор</Link>
      </p>
    )
  }

  if (isNew && !clientIdParam) {
    return (
      <p className="muted">
        Укажите clientId в URL. <Link to={homeLink}>К списку</Link>
      </p>
    )
  }

  if (loadState === 'loading') {
    return (
      <div className="trainer-path-loading" role="status" aria-live="polite" aria-busy="true">
        <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
        <p className="trainer-path-loading__text">Загрузка…</p>
      </div>
    )
  }

  const draftUiAligned = isTrainingDraftUiAligned({
    loadState,
    routeId: id,
    metaTrainingId: meta.trainingId,
    isNew,
    clientId: client?.id ?? clientIdParam,
  })
  // Кадр смены вкладки: URL уже другой, meta/workout ещё старые — не рисуем чужие упражнения.
  if (loadState === 'ok' && !draftUiAligned) {
    return (
      <div className="trainer-path-loading" role="status" aria-live="polite" aria-busy="true">
        <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
        <p className="trainer-path-loading__text">Загрузка…</p>
      </div>
    )
  }

  if (loadState === 'missing') {
    return (
      <p className="muted">
        Не найдено. <Link to={homeLink}>Назад</Link>
      </p>
    )
  }

  if (loadState === 'no_membership') {
    return (
      <p className="muted">
        У клиента нет активного абонемента — новую тренировку начать нельзя.{' '}
        <Link to={`${clientsBase}/${clientIdParam}${preserveClubQs}`}>В карточку клиента</Link>
      </p>
    )
  }

  if (loadState === 'awaiting_activate') {
    const isLateShift = membershipShiftMode === 'late'
    return (
      <div className="grid" style={{ gap: 16 }}>
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <h1 className="section-title" style={{ margin: 0 }}>
            {client?.name || 'Клиент'}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {isLateShift
              ? 'Абонемент уже стартовал, но занятий ещё не было. Можно сдвинуть срок от сегодняшней первой тренировки (в пределах 14 дней после старта) и начать занятие.'
              : 'Нет действующего абонемента на сегодня, но есть купленный со стартом впереди. Можно активировать его раньше (даты сдвинутся) и сразу начать тренировку.'}
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-touch"
              onClick={() => {
                setEarlyActivateError('')
                setEarlyActivateOpen(true)
              }}
            >
              {isLateShift ? 'Сдвинуть и начать' : 'Активировать и начать'}
            </button>
            {isLateShift ? (
              <button
                type="button"
                className="btn btn-ghost btn-touch"
                onClick={() => {
                  lateShiftDismissedRef.current = true
                  setEarlyActivateOpen(false)
                  setEarlyActivateProposal(null)
                  setMembershipShiftMode(null)
                  setLateDraftOffer(false)
                  setLoadState('ok')
                  bumpHydrateVersion((v) => v + 1)
                }}
              >
                Начать без сдвига
              </button>
            ) : null}
            <Link
              to={`${clientsBase}/${clientIdParam}${preserveClubQs}`}
              className="btn btn-ghost btn-touch u-no-decoration"
            >
              В карточку клиента
            </Link>
          </div>
        </div>
        <EarlyMembershipActivateSheet
          open={earlyActivateOpen}
          mode={isLateShift ? 'late' : 'early'}
          proposal={earlyActivateProposal}
          busy={earlyActivateBusy}
          error={earlyActivateError}
          allowSkipWithoutShift={isLateShift}
          onCancel={() => {
            if (earlyActivateBusy) return
            setEarlyActivateOpen(false)
            setEarlyActivateError('')
          }}
          onSkipWithoutShift={() => {
            if (earlyActivateBusy) return
            lateShiftDismissedRef.current = true
            setEarlyActivateOpen(false)
            setEarlyActivateProposal(null)
            setMembershipShiftMode(null)
            setLateDraftOffer(false)
            setLoadState('ok')
            bumpHydrateVersion((v) => v + 1)
          }}
          onConfirm={async () => {
            if (!clientIdParam) return
            setEarlyActivateBusy(true)
            setEarlyActivateError('')
            try {
              const res = isLateShift
                ? await applyLateMembershipStart(clientIdParam, todayLocalIso())
                : await applyEarlyMembershipActivation(clientIdParam, todayLocalIso())
              if (!res.ok) {
                setEarlyActivateError(
                  res.error || (isLateShift ? 'Не удалось сдвинуть срок' : 'Не удалось активировать'),
                )
                return
              }
              lateShiftDismissedRef.current = true
              setEarlyActivateOpen(false)
              await load()
            } catch (e) {
              setEarlyActivateError(
                e?.message || (isLateShift ? 'Не удалось сдвинуть срок' : 'Не удалось активировать'),
              )
            } finally {
              setEarlyActivateBusy(false)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="grid training-page-root" style={{ gap: 16 }}>
      <div className="trainer-path-head training-page-head-title">
        <div className="trainer-path-head__left training-page-head-title__left">
          <h1 className="trainer-path-head__title training-page-head-name">{title}</h1>
          {contra ? <ContraindicationsToggle text={contra} size="sm" mode="modal" /> : null}
        </div>
        <div className="training-page-head-title__right">
          {!isAdmin && clientKey && !isTrainingStatusCompleted(meta.status) ? (
            <div className="training-hr-idle">
              <button
                type="button"
                className={[
                  'btn',
                  'btn-secondary',
                  'btn-icon-square',
                  'btn-sm',
                  'training-hr-idle__btn',
                  hrLost ? 'training-hr-idle__btn--lost' : '',
                  !hr.supported ? 'training-hr-idle__btn--unsupported' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={hrBusy}
                onClick={() => {
                  if (!hr.supported) {
                    const msg =
                      hr.unsupportedHint ||
                      'Bluetooth-пульс на этом устройстве недоступен. Нужен Android-планшет с Chrome.'
                    window.alert(msg)
                    return
                  }
                  if (hrConnected) {
                    hr.disconnectClient(clientKey)
                    return
                  }
                  void hr.connectForClient({
                    clientId: clientKey,
                    clientName: client?.name ?? title,
                    maxHr: hrMaxHr,
                  })
                }}
                aria-label={
                  !hr.supported
                    ? 'Пульс недоступен на этом устройстве'
                    : hrConnected
                      ? 'Отключить пульсометр этого клиента'
                      : hrLost
                        ? 'Подключить пульсометр снова'
                        : 'Подключить пульсометр к этому клиенту'
                }
                title={
                  !hr.supported
                    ? hr.unsupportedHint || 'Bluetooth-пульс недоступен на Apple / Safari'
                    : hrConnected
                      ? 'Отключить пульс (также можно нажать чип в шапке)'
                      : hrLost
                        ? 'Связь потеряна — подключить снова'
                        : hrProfileHint
                          ? `Пульс — привязать датчик. ${hrProfileHint}`
                          : 'Пульс — привязать датчик к этому клиенту'
                }
              >
                <Activity size={18} aria-hidden />
              </button>
              {hrConnected || hrLost ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-sm"
                  disabled={hrBusy}
                  onClick={() =>
                    void hr.pickOtherForClient({
                      clientId: clientKey,
                      clientName: client?.name ?? title,
                      maxHr: hrMaxHr,
                    })
                  }
                  aria-label="Другой датчик"
                  title="Другой датчик"
                >
                  <Bluetooth size={16} aria-hidden />
                </button>
              ) : null}
              {hrLost ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-sm"
                  disabled={hrBusy}
                  onClick={() => hr.disconnectClient(clientKey)}
                  aria-label="Убрать слот пульса"
                  title="Убрать чип без подключения"
                >
                  ×
                </button>
              ) : null}
              {hr.supported && hrProfileHint && !hrConnected ? (
                <span className="training-hr-idle__hint" title={hrProfileHint}>
                  сводка неполная
                </span>
              ) : null}
            </div>
          ) : null}
          {clientCardTrainingsHref ? (
            <Link
              to={clientCardTrainingsHref}
              className="btn btn-secondary btn-icon-square btn-sm training-page-head-card-link"
              aria-label="Карточка клиента — все тренировки"
              title="Карточка клиента — все тренировки"
            >
              <UserCircle size={18} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      {lateBlockedNotice ? (
        <div className="card" role="status" style={{ borderColor: 'var(--warning, #c9a227)' }}>
          <p className="muted" style={{ margin: 0 }}>
            {lateBlockedNotice}
          </p>
        </div>
      ) : null}

      {lateDraftOffer && earlyActivateProposal && membershipShiftMode === 'late' && !lateShiftDismissedRef.current ? (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <p className="muted" style={{ margin: 0 }}>
            Абонемент стартовал раньше этой тренировки. Можно сдвинуть срок от первой тренировки (длина та же).
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-touch"
              onClick={() => {
                setEarlyActivateError('')
                setEarlyActivateOpen(true)
              }}
            >
              Сдвинуть срок
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-touch"
              onClick={() => {
                lateShiftDismissedRef.current = true
                setLateDraftOffer(false)
                setEarlyActivateProposal(null)
                setMembershipShiftMode(null)
                setEarlyActivateOpen(false)
              }}
            >
              Без сдвига
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="training-head">
          <div className="training-head__top">
            <div className="training-tiles" role="group" aria-label="Параметры тренировки">
              <div className="training-tile training-tile--date training-tile--clickable" aria-label="Дата тренировки">
                <div className="training-tile__label">Дата</div>
                <div className="training-tile__value">{formatDateRu(trainingDate)}</div>
                <button
                  type="button"
                  className="training-tile__icon-btn"
                  aria-label="Выбрать дату"
                  title="Выбрать дату"
                  onClick={() => {
                    const el = dateInputRef.current
                    if (!el) return
                    // Chromium: show native picker programmatically
                    if (typeof el.showPicker === 'function') el.showPicker()
                    else {
                      el.focus()
                      el.click()
                    }
                  }}
                  disabled={!canChangeDate}
                >
                  <Calendar size={14} aria-hidden />
                </button>
                <input
                  className="training-tile__input training-tile__input--overlay"
                  type="date"
                  value={trainingDate}
                  max={todayLocalIso()}
                  onChange={(e) => setTrainingDate(e.target.value)}
                  required
                  aria-label="Дата тренировки"
                  ref={dateInputRef}
                  disabled={!canChangeDate}
                />
              </div>

              <div className="training-tile" aria-label="Номер тренировки в абонементе">
                <div className="training-tile__label">Трен.</div>
                <div className="training-tile__value">{membershipTileLabel}</div>
              </div>

              <div className="training-tile" aria-label="Дней до окончания абонемента">
                <div className="training-tile__label">Дней</div>
                <div className="training-tile__value">{daysTileLabel}</div>
              </div>

              <div className="training-tile training-tile--accent" aria-label="Вес до тренировки">
                <div className="training-tile__label">Вес</div>
                <input
                  className="training-tile__input training-tile__input--accent"
                  type="number"
                  min={0}
                  step="0.1"
                  value={workoutState.pre_weight_kg ?? ''}
                  onChange={(e) => setWorkoutState((w) => ({ ...w, pre_weight_kg: e.target.value }))}
                  aria-label="Вес до тренировки, кг"
                  title="Если уже указан в карте здоровья — подставляется автоматически, можно поправить"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0, marginTop: 10 }}>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Направленность тренировки
            <span className="tip" data-tip="Коротко опиши цель занятия (например: выносливость, техника, жиросжигание). Это будет видно в списке тренировок клиента.">
              <button type="button" className="btn btn-ghost btn-icon-square btn-icon-xs" aria-label="Подсказка: направленность тренировки">
                <Info size={16} aria-hidden />
              </button>
            </span>
          </label>
          <input
            className="input"
            value={workoutState.training_focus ?? ''}
            onChange={(e) => setWorkoutState((w) => ({ ...w, training_focus: stripDirectionControls(e.target.value) }))}
          />
        </div>
      </div>

      <TrainingForm
        key={resolveTrainingFormRemountKey({
          routeId: id,
          clientId: client?.id ?? clientIdParam,
        })}
        value={workoutState}
        onChange={applyWorkoutState}
        trainingType={trainingType}
        clientId={client?.id ?? clientIdParam ?? ''}
        currentTrainingId={resolveTrainingFormPlaceKey({
          trainingId: meta.trainingId,
          routeId: id,
          clientId: client?.id ?? clientIdParam,
        })}
        hrSessionSummary={displayHrSummary}
      />

      {saveError ? (
        <p className="muted" style={{ color: 'var(--danger)', margin: 0 }}>
          {saveError}
        </p>
      ) : null}

      {saveNotice ? (
        <p className="muted" style={{ color: 'var(--accent-bright)', margin: 0 }} role="status">
          {saveNotice}
        </p>
      ) : null}

      <div className="row training-actions-row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {isTrainingStatusCompleted(meta.status) ? (
            <span className="tip" data-tip="Сохранить правки. Статус «завершена» не снимается, абон повторно не списывается.">
              <button
                type="button"
                className="btn btn-primary btn-touch"
                disabled={completeBusy}
                onClick={() => {
                  setShowCompletionHints(false)
                  void persist('completed')
                }}
              >
                {completeBusy ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </span>
          ) : canCompleteTraining ? (
            <span className="tip" data-tip="Пометит тренировку как завершённую и сохранит. Если есть проблема — появится сообщение ниже.">
              <button
                type="button"
                className="btn btn-primary btn-touch"
                disabled={completeBusy}
                onClick={() => {
                  setShowCompletionHints(false)
                  void persist('completed')
                }}
              >
                {completeBusy ? 'Сохраняем…' : 'Закончить тренировку'}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-touch btn-primary--incomplete"
              title="Подсказка по шагам"
              onClick={() => setShowCompletionHints(true)}
            >
              Закончить тренировку
            </button>
          )}
          {!isTrainingStatusCompleted(meta.status) ? (
          <span className="tip" data-tip="Сохранить черновик (можно продолжить позже).">
            <button
              type="button"
              className="btn btn-ghost training-draft-save-btn"
              aria-label="Сохранить черновик"
              title="Сохранить черновик"
              onClick={() => persist('draft')}
            >
              <Save size={22} strokeWidth={1.65} aria-hidden />
            </button>
          </span>
          ) : null}
          {meta.status !== 'completed' ? (
            <span
              className={`autosave-pill${autosaveStatus === 'saving' ? ' autosave-pill--active' : ''}${autosaveStatus === 'error' ? ' autosave-pill--error' : ''}`}
              aria-live="polite"
            >
              {autosaveStatus === 'saving'
                ? 'Сохранение…'
                : autosaveStatus === 'saved'
                  ? 'Сохранено'
                  : autosaveStatus === 'error'
                    ? 'Не удалось сохранить'
                    : ''}
            </span>
          ) : null}
          {syncOutbound.ready && syncOutbound.hasPending ? (
            <span className="autosave-pill autosave-pill--error" aria-live="polite" title="Данные сохранены на планшете; отправка в облако — в очереди">
              В очереди: {syncOutbound.total}
            </span>
          ) : null}
        </div>

      {showCompletionHints && nextCompletionHint ? (
        <div className="training-completion-hint" role="status">
          <div className="training-completion-hint__head">
            <p className="training-completion-hint__step">{nextCompletionHint}</p>
            <CloseButton
              className="training-completion-hint__close"
              label="Закрыть подсказку"
              onClick={() => setShowCompletionHints(false)}
            />
          </div>
        </div>
      ) : null}

      <EarlyMembershipActivateSheet
        open={earlyActivateOpen && membershipShiftMode === 'late' && !!earlyActivateProposal}
        mode="late"
        proposal={earlyActivateProposal}
        busy={earlyActivateBusy}
        error={earlyActivateError}
        allowSkipWithoutShift
        onCancel={() => {
          if (earlyActivateBusy) return
          setEarlyActivateOpen(false)
          setEarlyActivateError('')
        }}
        onSkipWithoutShift={() => {
          if (earlyActivateBusy) return
          lateShiftDismissedRef.current = true
          setLateDraftOffer(false)
          setEarlyActivateOpen(false)
          setEarlyActivateProposal(null)
          setMembershipShiftMode(null)
          setEarlyActivateError('')
          setSaveError('')
        }}
        onConfirm={async () => {
          const cid = client?.id ?? clientIdParam
          if (!cid) return
          setEarlyActivateBusy(true)
          setEarlyActivateError('')
          try {
            const day = String(trainingDate || todayLocalIso()).slice(0, 10)
            const res = await applyLateMembershipStart(cid, day)
            if (!res.ok) {
              setEarlyActivateError(res.error || 'Не удалось сдвинуть срок')
              return
            }
            lateShiftDismissedRef.current = true
            setLateDraftOffer(false)
            setEarlyActivateOpen(false)
            setEarlyActivateProposal(null)
            setMembershipShiftMode(null)
            setSaveError('')
            setMembershipSummary(
              await loadTrainingMembershipTileSummary({
                clientId: cid,
                trainingDate: day,
                status: 'draft',
                fallbackDate: day,
              }),
            )
            setSaveNotice('Срок абонемента сдвинут от первой тренировки')
          } catch (e) {
            setEarlyActivateError(e?.message || 'Не удалось сдвинуть срок')
          } finally {
            setEarlyActivateBusy(false)
          }
        }}
      />
    </div>
  )
}
