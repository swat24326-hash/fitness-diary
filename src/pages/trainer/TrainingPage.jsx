import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Calendar, Info, Save } from 'lucide-react'
import { TrainingForm, emptyTrainingData } from '../../components/TrainingForm'
import { ContraindicationsToggle } from '../../components/ContraindicationsToggle'
import { useAuth } from '../../context/AuthContext'
import { getHealthCard, getLocalClient, listClubsLocal, listMemberships } from '../../lib/dataAccess'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { getDb } from '../../lib/localDb'
import { pickUsableMembershipForDate } from '../../lib/membershipRules'
import { saveLocalWithSync } from '../../lib/syncService'
import { stripDirectionControls } from '../../lib/textInput'
import { getTrainingCompletionIssues } from '../../lib/trainingCompletionValidation'

const TRAINING_TYPES = ['Силовая', 'Функциональная', 'Кардио']

function sanitizeWorkoutData(w, opts = {}) {
  if (!w || typeof w !== 'object') return {}
  const { pre_hr: _dropHr, meal_note: _mn, survey_notes: _sn, readiness: _rd, ...rest } = w
  const includeSetHr = opts.includeSetHr === true
  const exercises = Array.isArray(w.exercises)
    ? w.exercises.map((e) => ({
        ...e,
        sets: (e.sets ?? []).map((s) => ({
          reps: s.reps ?? '',
          weight_kg: s.weight_kg ?? '',
          tut_sec: s.tut_sec ?? '',
          load: s.load ?? '',
          rpe: s.rpe ?? '',
          ...(includeSetHr ? { hr_after: s.hr_after ?? '' } : {}),
        })),
      }))
    : []
  return { ...rest, exercises }
}

/** Активный абонемент: номер тренировки, всего, дней до end_date */
async function activeMembershipSummary(clientId) {
  if (!clientId) return null
  const mems = await listMemberships(clientId)
  const today = todayLocalIso()
  const active = pickUsableMembershipForDate(mems, today)
  if (!active) return null
  const total = Number(active.total_trainings)
  const used = Number(active.used_trainings)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return null
  if (used >= total) return null

  return {
    current: Math.min(used + 1, total),
    total,
    endDate: active.end_date ? String(active.end_date) : null,
  }
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
  return JSON.stringify({
    cid: clientId,
    type: trainingType,
    date: trainingDate,
    draft: status !== 'completed',
    data: sanitizeWorkoutData(workoutState, { includeSetHr: trainingType === 'Функциональная' || trainingType === 'Кардио' }),
  })
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
  const todayIso = useMemo(() => todayLocalIso(), [])

  const [client, setClient] = useState(null)
  const [workoutState, setWorkoutState] = useState(emptyTrainingData)
  const [trainingType, setTrainingType] = useState('Силовая')
  const [trainingDate, setTrainingDate] = useState(() => todayIso)
  const [contra, setContra] = useState('')
  const [meta, setMeta] = useState({ status: 'draft', trainingId: null })
  const [loadState, setLoadState] = useState('loading')
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [membershipSummary, setMembershipSummary] = useState(null)
  const [autosaveStatus, setAutosaveStatus] = useState('idle') // idle | saving | saved | error

  const saveMutexRef = useRef(Promise.resolve())
  const [hydrateVersion, bumpHydrateVersion] = useState(0)
  const autosaveTimerRef = useRef(null)
  const draftTrainingIdRef = useRef(null)
  const autosaveUiTimerRef = useRef(null)
  const userEditedRef = useRef(false)
  const baselineContentSnapshotRef = useRef('')

  const runExclusive = useCallback(async (fn) => {
    const next = saveMutexRef.current.then(fn, fn)
    saveMutexRef.current = next.catch(() => {})
    return next
  }, [])

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoadState('loading')
    setSaveError('')
    if (isNew) {
      if (!clientIdParam) {
        setLoadState('missing')
        return
      }
      const c = await getLocalClient(clientIdParam)
      setClient(c ?? null)
      setWorkoutState(emptyTrainingData())
      setTrainingType('Силовая')
      setTrainingDate(todayIso)
      setMeta({ status: 'draft', trainingId: null })
      const hc = await getHealthCard(clientIdParam)
      setContra((hc?.contraindications ?? '').trim())
      const ms = await activeMembershipSummary(clientIdParam)
      setMembershipSummary(ms)
      draftTrainingIdRef.current = null
      if (!c) {
        setLoadState('missing')
        return
      }
      if (!ms) {
        setLoadState('no_membership')
        return
      }
      setLoadState('ok')
      bumpHydrateVersion((v) => v + 1)
      return
    }

    const db = await getDb()
    const t = await db.get('trainings', id)
    if (!t) {
      setClient(null)
      setMeta({ status: 'draft', trainingId: null })
      draftTrainingIdRef.current = null
      setMembershipSummary(null)
      setLoadState('missing')
      return
    }
    setMeta({ status: t.status, trainingId: t.id })
    const c = await getLocalClient(t.client_id)
    setClient(c)
    const w = typeof t.data === 'object' && t.data ? sanitizeWorkoutData(t.data, { includeSetHr: true }) : {}
    setWorkoutState({ ...emptyTrainingData(), ...w })
    setTrainingType(t.type && TRAINING_TYPES.includes(t.type) ? t.type : 'Силовая')
    setTrainingDate(t.date ?? todayIso)
    const hc = await getHealthCard(t.client_id)
    setContra((hc?.contraindications ?? '').trim())
    setMembershipSummary(await activeMembershipSummary(t.client_id))
    draftTrainingIdRef.current = t.id
    setLoadState('ok')
    bumpHydrateVersion((v) => v + 1)
  }, [user?.id, isNew, clientIdParam, id])

  useEffect(() => {
    if (isNew && isAdmin) return
    void load()
  }, [load, isNew, isAdmin])

  /** Сохранение тренировки. `silent=true` для автосохранения (не показывает “Сохранено”). */
  const persist = async (status, opts = {}) => {
    const silent = opts.silent === true
    const skipNavigate = opts.skipNavigate === true
    if (!silent) {
      setSaveError('')
      setSaveNotice('')
    } else {
      // автосэйв не должен оставлять “залипшую” ошибку после успешной попытки
      setSaveError('')
    }
    if (!user?.id) return
    const stableFromRoute = id && id !== 'new' ? id : null
    let trainingId = meta.trainingId ?? draftTrainingIdRef.current ?? stableFromRoute
    if (!trainingId) {
      trainingId = crypto.randomUUID()
      draftTrainingIdRef.current = trainingId
      setMeta((m) => ({ ...m, trainingId }))
    }
    const cid = client?.id ?? clientIdParam
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

    const nextStatus = status ?? meta.status ?? 'draft'
    if (nextStatus === 'completed' && !silent) {
      const blockers = getTrainingCompletionIssues(workoutState)
      if (blockers.length > 0) {
        setShowCompletionHints(true)
        setSaveError('')
        setSaveNotice('')
        return
      }
    }

    // Для тренера: тренировка проводится "в моменте".
    // Если черновик завершили на следующий день — считаем датой завершения "сегодня"
    // (и списываем по сегодняшнему абонементу).
    const effectiveDate = isAdmin ? trainingDate : todayIso
    const now = new Date().toISOString()
    const db = await getDb()
    let prev = id && id !== 'new' ? await db.get('trainings', id) : null
    if (!prev && meta.trainingId) {
      prev = await db.get('trainings', meta.trainingId)
    }

    // club_id обязателен для записи. В dev/локальном режиме можно восстановить его
    // из предыдущей тренировки/абонемента/первого клуба, если в карточке клиента он не заполнен.
    let club_id = client?.club_id ?? prev?.club_id ?? null
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

    const wm = parseInt(String(workoutState.warmup_duration_min ?? ''), 10) || 0
    const cm = parseInt(String(workoutState.cooldown_duration_min ?? ''), 10) || 0

    const dataPayload = {
      ...sanitizeWorkoutData(workoutState, { includeSetHr: trainingType === 'Функциональная' || trainingType === 'Кардио' }),
      duration_min: wm + cm > 0 ? wm + cm : workoutState.duration_min ?? '',
    }

    // Списание тренировки с абонемента: только при ПЕРВОМ переводе в completed.
    // Повторное "Завершить" после редактирования не меняет used_trainings.
    if (nextStatus === 'completed' && prev?.status !== 'completed') {
      let mems = []
      try {
        mems = await listMemberships(cid)
      } catch {
        mems = []
      }
      const picked = pickUsableMembershipForDate(mems, effectiveDate)
      if (!picked) {
        if (silent) setAutosaveStatus('error')
        if (!silent) setSaveError('Нет активного абонемента на текущую дату — списание невозможно.')
        return
      }
      const total = Number(picked.total_trainings ?? 0)
      const used = Number(picked.used_trainings ?? 0)
      if (Number.isFinite(total) && total > 0 && Number.isFinite(used) && used >= total) {
        if (silent) setAutosaveStatus('error')
        if (!silent) setSaveError('Лимит тренировок по абонементу исчерпан — списание невозможно.')
        return
      }
      const nextUsed = Number.isFinite(used) ? used + 1 : 1
      try {
        await saveLocalWithSync('memberships', { ...picked, used_trainings: nextUsed }, { table_name: 'memberships', operation: 'update', remote_id: picked.id })
      } catch (e) {
        if (silent) setAutosaveStatus('error')
        if (!silent) setSaveError(e?.message ?? 'Не удалось списать тренировку с абонемента')
        return
      }
      dataPayload.membership_id = picked.id
    }
    const trainerIdForRow = isAdmin ? prev?.trainer_id ?? client?.trainer_id ?? user.id : user.id
    const row = {
      id: prev?.id ?? trainingId,
      client_id: cid,
      trainer_id: trainerIdForRow,
      club_id,
      date: nextStatus === 'completed' ? effectiveDate : trainingDate,
      type: trainingType,
      status: nextStatus,
      data: dataPayload,
      created_at: prev?.created_at ?? now,
      synced: false,
    }
    await runExclusive(async () => {
      if (silent) {
        setAutosaveStatus('saving')
      }
      try {
        await saveLocalWithSync('trainings', row, {
          table_name: 'trainings',
          operation: prev ? 'update' : 'insert',
          remote_id: prev ? row.id : null,
        })
      } catch (e) {
        if (!silent) setSaveError(e?.message ?? 'Ошибка сохранения')
        if (silent) setAutosaveStatus('error')
        return
      }

      setMeta({ status: row.status, trainingId: row.id })
      const fpAfter = trainingContentFingerprint({
        clientId: cid,
        trainingType,
        trainingDate,
        status: row.status,
        workoutState,
      })
      if (!silent) {
        setSaveNotice(row.status === 'completed' ? 'Тренировка завершена и сохранена.' : 'Черновик сохранён.')
        userEditedRef.current = false
        baselineContentSnapshotRef.current = fpAfter
        setAutosaveStatus('idle')
        if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
      } else if (userEditedRef.current) {
        setAutosaveStatus('saved')
        userEditedRef.current = false
        baselineContentSnapshotRef.current = fpAfter
        if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
        autosaveUiTimerRef.current = setTimeout(() => {
          setAutosaveStatus((cur) => (cur === 'saved' ? 'idle' : cur))
        }, 1400)
      } else {
        // Автосэйв без «редактирования» (первый тик, flush, только tid): нельзя оставлять вечное «Сохранение…»
        baselineContentSnapshotRef.current = fpAfter
        if (autosaveUiTimerRef.current) clearTimeout(autosaveUiTimerRef.current)
        setAutosaveStatus((cur) => (cur === 'saved' ? 'saved' : 'idle'))
      }

      if (row.status === 'completed') {
        if (!skipNavigate) nav(`${clientsBase}/${cid}${preserveClubQs}`, { replace: true })
        return
      }

      const shouldPromoteUrl = row.status !== 'completed' && isNew && id === 'new' && cid
      const clubQ = search.get('club')
      const nextUrlClient = clubQ
        ? `?clientId=${encodeURIComponent(cid)}&club=${encodeURIComponent(clubQ)}`
        : `?clientId=${encodeURIComponent(cid)}`
      if (shouldPromoteUrl) {
        // После первого сохранения делаем URL стабильным (/workouts/:id), даже если автосэйв включён skipNavigate.
        nav(`${workoutsBase}/${row.id}${nextUrlClient}`, { replace: true })
      } else if (!skipNavigate && row.status !== 'completed' && isNew) {
        nav(`${workoutsBase}/${row.id}${preserveClubQs}`, { replace: true })
      }
    })
  }

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

  const flushSnapshotKey = useMemo(() => {
    return JSON.stringify({ hydrate: hydrateVersion, content: contentFingerprint, tid: meta.trainingId })
  }, [hydrateVersion, contentFingerprint, meta.trainingId])

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

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      void persist('draft', { silent: true, skipNavigate: true })
    }, 650)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [snapshotKey, loadState, user?.id, meta.status])

  useEffect(() => {
    if (loadState !== 'ok') return
    if (!user?.id) return

    let cancelled = false
    const flush = () => {
      if (cancelled) return
      void persist('draft', { silent: true, skipNavigate: true })
    }

    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flushSnapshotKey, loadState, user?.id])

  const title = useMemo(() => {
    if (!client) return ''
    return client.name
  }, [client])

  const daysUntilMembershipEnd = useMemo(() => {
    if (!membershipSummary?.endDate || !trainingDate) return null
    return calendarDaysUntil(trainingDate, membershipSummary.endDate)
  }, [membershipSummary, trainingDate])

  const completionIssues = useMemo(() => getTrainingCompletionIssues(workoutState), [workoutState])
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
    return <p className="muted">Загрузка…</p>
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

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="training-page-head-title">
        <h1 className="training-page-head-name">{title}</h1>
        {contra ? <ContraindicationsToggle text={contra} size="sm" mode="modal" /> : null}
      </div>

      <div className="card">
        <div className="training-head">
          <div className="training-head__top">
            <div className="training-tiles" role="group" aria-label="Параметры тренировки">
              <div className="training-tile training-tile--clickable" aria-label="Дата тренировки">
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
                  disabled={!isAdmin}
                >
                  <Calendar size={14} aria-hidden />
                </button>
                <input
                  className="training-tile__input training-tile__input--overlay"
                  type="date"
                  value={trainingDate}
                  onChange={(e) => setTrainingDate(e.target.value)}
                  required
                  aria-label="Дата тренировки"
                  ref={dateInputRef}
                  disabled={!isAdmin}
                />
              </div>

              <div className="training-tile" aria-label="Номер тренировки в абонементе">
                <div className="training-tile__label">Трен.</div>
                <div className="training-tile__value">{membershipSummary ? `${membershipSummary.current}/${membershipSummary.total}` : '—'}</div>
              </div>

              <div className="training-tile" aria-label="Дней до окончания абонемента">
                <div className="training-tile__label">Дней</div>
                <div className="training-tile__value">
                  {daysUntilMembershipEnd == null ? '—' : daysUntilMembershipEnd < 0 ? '0' : String(daysUntilMembershipEnd)}
                </div>
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

      <TrainingForm value={workoutState} onChange={setWorkoutState} trainingType={trainingType} onTrainingTypeChange={setTrainingType} />

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
        {canCompleteTraining ? (
          <span className="tip" data-tip="Пометит тренировку как завершённую и сохранит. Если есть проблема — появится сообщение ниже.">
            <button
              type="button"
              className="btn btn-primary btn-touch"
              onClick={() => {
                setShowCompletionHints(false)
                void persist('completed')
              }}
            >
              Закончить тренировку
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
      </div>

      {showCompletionHints && nextCompletionHint ? (
        <div className="training-completion-hint" role="status">
          <div className="training-completion-hint__head">
            <p className="training-completion-hint__step">{nextCompletionHint}</p>
            <button type="button" className="btn btn-ghost btn-icon-square training-completion-hint__close" aria-label="Закрыть подсказку" onClick={() => setShowCompletionHints(false)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
