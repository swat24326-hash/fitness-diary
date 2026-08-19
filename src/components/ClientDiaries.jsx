import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  Heart,
  Layers,
  Pencil,
  Play,
  Search,
  Timer,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useHeartRateSessions } from '../context/HeartRateSessionsContext'
import { listMemberships } from '../lib/dataAccess'
import { ensureClientTrainingsCached } from '../lib/clientTrainingsEnsure.js'
import {
  membershipCoversDate,
  membershipHasRemaining,
  membershipIsSessionDepletedOn,
  isCalendarUnlimitedMembership,
  compareTrainingsChronological,
  completedWorkoutNumberOnMembership,
  resolveMembershipForDiaryTraining,
} from '../lib/membershipRules'
import { useDebouncedStorageReload, shouldReloadTrainerClientStats } from '../lib/useDebouncedStorageReload'
import { deleteLocalWithSync, saveLocalWithSync } from '../lib/syncService'
import { detachWeightEntriesFromTraining } from '../lib/clientWeightService.js'
import { formatDateRu } from '../lib/dateRu'
import { normalizeHrSessionSnapshot } from '../lib/hr/hrSessionAgg.js'
import { TrainingViewModal } from './trainer/TrainingViewModal'

const RU_WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']

/** Новее календарный день — выше. В один день: последняя по времени сессия сверху, первая — внизу. */
function compareDiaryListOrder(a, b) {
  const da = String(a?.date ?? '').slice(0, 10)
  const db = String(b?.date ?? '').slice(0, 10)
  if (da !== db) return db.localeCompare(da)
  return compareTrainingsChronological(b, a)
}

function formatDiaryDate(dateStr) {
  if (!dateStr) return '—'
  const parts = String(dateStr).split('-')
  if (parts.length !== 3) return dateStr
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!y || !m || !d) return dateStr
  const dt = new Date(y, m - 1, d)
  const wd = RU_WEEKDAYS[dt.getDay()]
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}, ${wd}`
}

function clone(obj) {
  try {
    return structuredClone(obj)
  } catch {
    return JSON.parse(JSON.stringify(obj ?? {}))
  }
}

function FocusText({ data }) {
  const f = String(data?.training_focus ?? '').trim()
  return f || '—'
}

/** Окраска полосы: мало слотов после этой тренировки или до черновика — жёлтая метка */
function membershipToneBySlotsLeft(total, slotsLeftAfter) {
  if (!Number.isFinite(total) || total <= 0) return 'neutral'
  if (!Number.isFinite(slotsLeftAfter)) return 'green'
  if (slotsLeftAfter <= Math.max(1, Math.ceil(total * 0.15))) return 'yellow'
  return 'green'
}

function toneClassFromMetricKey(metric) {
  if (metric === 'yellow') return 'yellow'
  if (metric === 'neutral') return 'neutral'
  if (metric === 'red') return 'red'
  return 'green'
}

/**
 * Абонемент на карточке: «до даты · тренировка n/m» или «… · следующая n/m» для черновика.
 * По завершённым — номер по membership_id в data или по датам периода (хронология в membershipRules).
 */
function membershipForTrainingDate(dateStr, memberships, training, allTrainings) {
  if (!dateStr || !memberships?.length) {
    return { tone: 'neutral', label: 'Абонемент: нет данных' }
  }
  const d = dateStr

  const mFocused = resolveMembershipForDiaryTraining(training ?? {}, d, memberships)
  const endsOf = (m) => formatDateRu(m.end_date)

  if (mFocused && membershipCoversDate(mFocused, d)) {
    const total = Number(mFocused.total_trainings ?? 0)
    const used = Number(mFocused.used_trainings ?? 0)
    const ends = endsOf(mFocused)

    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) {
      return { tone: 'neutral', label: `Абонемент: до ${ends}` }
    }

    const isDraft = training?.status === 'draft'
    const isCompleted = training?.status === 'completed'

    if (membershipHasRemaining(mFocused)) {
      if (isDraft) {
        const nextN = Math.min(total, Math.max(1, used + 1))
        const metric = membershipToneBySlotsLeft(total, total - used)
        return {
          tone: toneClassFromMetricKey(metric),
          label: `Абонемент: до ${ends}, следующая тренировка ${nextN}/${total}`,
        }
      }
      if (isCompleted) {
        const n = allTrainings && training ? completedWorkoutNumberOnMembership(training, mFocused, allTrainings) : null
        if (n == null || !Number.isFinite(n)) {
          return { tone: 'green', label: `Абонемент: до ${ends}` }
        }
        const metric = membershipToneBySlotsLeft(total, total - n)
        return {
          tone: toneClassFromMetricKey(metric),
          label: `Абонемент: до ${ends}, тренировка ${n}/${total}`,
        }
      }
      return { tone: 'green', label: `Абонемент: до ${ends}` }
    }

    if (isCompleted && allTrainings && training) {
      const n = completedWorkoutNumberOnMembership(training, mFocused, allTrainings)
      if (n != null && Number.isFinite(n)) {
        const metric = membershipToneBySlotsLeft(total, total - n)
        return {
          tone: toneClassFromMetricKey(metric),
          label: `Абонемент: до ${ends}, тренировка ${n}/${total}`,
        }
      }
    }
    return { tone: 'red', label: `Абонемент: лимит исчерпан (до ${ends})` }
  }

  const depletedCover = [...memberships]
    .filter((m) => membershipIsSessionDepletedOn(m, d))
    .sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0]
  if (depletedCover) {
    return { tone: 'red', label: `Абонемент: лимит исчерпан (до ${endsOf(depletedCover)})` }
  }
  const emptyPackageCover = [...memberships]
    .filter((m) => membershipCoversDate(m, d) && isCalendarUnlimitedMembership(m))
    .sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0]
  if (emptyPackageCover) {
    return { tone: 'red', label: `Абонемент: нет занятий в пакете (до ${endsOf(emptyPackageCover)})` }
  }
  const endedBefore = [...memberships]
    .filter((m) => m.end_date < d)
    .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0]
  if (endedBefore) {
    return { tone: 'red', label: `Абонемент: ИСТЕК ${endsOf(endedBefore)}` }
  }
  const future = [...memberships]
    .filter((m) => String(m.start_date ?? '') > d && membershipHasRemaining(m))
    .sort((a, b) => String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')))[0]
  if (future) {
    return { tone: 'yellow', label: `Абонемент с ${formatDateRu(future.start_date)} (до ${endsOf(future)})` }
  }
  return { tone: 'neutral', label: 'Абонемент: нет данных' }
}

function MembershipBanner({ training, memberships, allTrainings }) {
  const m = membershipForTrainingDate(training?.date ?? null, memberships, training, allTrainings)
  return <div className={`diary-membership diary-membership--${m.tone}`}>{m.label}</div>
}

/**
 * Вкладка «Дневники»: список тренировок клиента с поиском, фильтрами и карточками.
 */
export function ClientDiaries({ client, onDataChange, clubQs = '', readOnly = false }) {
  const { user, isAdmin, isSupervisor } = useAuth()
  const hr = useHeartRateSessions()
  const workoutPrefix = isAdmin ? '/admin/workouts' : isSupervisor ? '/club/workouts' : '/trainer/workouts'
  const [trainings, setTrainings] = useState([])
  const [memberships, setMemberships] = useState([])

  const [dateSearch, setDateSearch] = useState('')
  const [focusSearch, setFocusSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [viewTraining, setViewTraining] = useState(null)

  const load = useCallback(async () => {
    if (!client?.id) return
    const mine = [...(await ensureClientTrainingsCached(client.id))].sort(compareDiaryListOrder)
    setTrainings(mine)
    setMemberships(await listMemberships(client.id))
  }, [client?.id])

  useEffect(() => {
    load()
  }, [load])

  useDebouncedStorageReload(() => load(), { shouldRun: shouldReloadTrainerClientStats })

  const notify = useCallback(() => {
    load()
    onDataChange?.()
  }, [load, onDataChange])

  const filtered = useMemo(() => {
    return trainings.filter((t) => {
      if (filterStatus && t.status !== filterStatus) return false

      const tokensDate = dateSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const tokensFocus = focusSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)

      // 1) Фильтр по дате (только t.date)
      if (tokensDate.length) {
        const iso = String(t.date ?? '').toLowerCase()
        const pretty = formatDiaryDate(t.date).toLowerCase()
        const parts = String(t.date ?? '').split('-')
        const dmy = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : ''
        const dateMatched = tokensDate.every((tok) => iso.includes(tok) || pretty.includes(tok) || dmy.includes(tok))
        if (!dateMatched) return false
      }

      // 2) Фильтр по направленности (только training_focus)
      if (tokensFocus.length) {
        const focus = String(t.data?.training_focus ?? '').toLowerCase()
        const focusMatched = tokensFocus.every((tok) => focus.includes(tok))
        if (!focusMatched) return false
      }

      return true
    })
  }, [trainings, dateSearch, focusSearch, filterStatus])

  const copyTraining = async (t) => {
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const newId = crypto.randomUUID()
    const rawData = clone(t.data ?? {})
    if (rawData && typeof rawData === 'object') delete rawData.hr_session
    const row = {
      id: newId,
      client_id: client.id,
      trainer_id: t.trainer_id,
      club_id: t.club_id ?? client.club_id,
      date: today,
      type: t.type ?? 'Силовая',
      status: 'draft',
      data: rawData,
      created_at: now,
      synced: false,
    }
    await saveLocalWithSync('trainings', row, { table_name: 'trainings', operation: 'insert', remote_id: null })
    notify()
  }

  const deleteTraining = async (id) => {
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    if (!window.confirm('Удалить черновик тренировки?')) return
    const cid = client?.id
    await detachWeightEntriesFromTraining(id, cid)
    await deleteLocalWithSync('trainings', id, 'trainings')
    try {
      if (cid && id) hr.discardTrainingSamples(cid, id)
    } catch {
      /* пульс — локальный буфер, удаление черновика важнее */
    }
    notify()
  }

  return (
    <div className="card diary-shell-card">
      <div className="row u-mb-4 u-items-center">
        <h2 className="section-title diary-page-title">
          <ClipboardList size={22} aria-hidden />
          Все тренировки
        </h2>
      </div>
      <div className="diary-toolbar">
        <div className="diary-toolbar__date">
          <label className="label u-inline u-items-center u-gap-6" htmlFor="diary-search">
            <Search size={14} aria-hidden />
            Поиск по дате
          </label>
          <input
            id="diary-search"
            className="input"
            value={dateSearch}
            onChange={(e) => setDateSearch(e.target.value)}
          />
        </div>

        <div className="diary-toolbar__focus">
          <label className="label u-inline u-items-center u-gap-6" htmlFor="diary-focus-search">
            <Layers size={14} aria-hidden />
            Направленность (ключевые слова)
          </label>
          <input
            id="diary-focus-search"
            className="input"
            value={focusSearch}
            onChange={(e) => setFocusSearch(e.target.value)}
          />
        </div>

        <div className="diary-toolbar__status">
          <label className="label" htmlFor="diary-status">
            Статус
          </label>
          <select id="diary-status" className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="completed">Завершена</option>
            <option value="draft">Черновик</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 && <p className="muted">Нет тренировок по заданным условиям.</p>}

      <div className="diary-cards-grid">
        {filtered.map((t) => {
          const data = t.data && typeof t.data === 'object' ? t.data : {}
          const isDraft = t.status === 'draft'
          const hrSnap = normalizeHrSessionSnapshot(data.hr_session)
          return (
            <article key={t.id} className="diary-card diary-card--compact">
              <div className="diary-card__head">
                <div className="diary-card__date">
                  <Calendar size={14} className="stat-card__icon" aria-hidden />
                  {formatDiaryDate(t.date)}
                </div>
                <div className="diary-card__actions-top">
                  <button
                    type="button"
                    className="diary-btn diary-btn--icon"
                    onClick={() => setViewTraining(t)}
                    aria-label="Просмотр тренировки"
                    title="Просмотр"
                  >
                    <Eye size={16} aria-hidden />
                  </button>
                  {!readOnly ? (
                    <>
                      <Link
                        to={`${workoutPrefix}/${t.id}${clubQs}`}
                        className="diary-btn diary-btn--icon u-no-decoration"
                        aria-label="Редактировать тренировку"
                        title="Редактировать"
                      >
                        <Pencil size={16} aria-hidden />
                      </Link>
                      <button
                        type="button"
                        className="diary-btn diary-btn--icon"
                        title="Копировать как новый черновик"
                        aria-label="Копировать как новый черновик"
                        onClick={() => copyTraining(t)}
                      >
                        <Copy size={13} aria-hidden />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="diary-card__cols">
                <div className="diary-card__col diary-card__col--left">
                  <div className="diary-card__meta diary-card__meta--col">
                  <span className="diary-focus-pill" aria-label="Направленность">
                    <FocusText data={data} />
                  </span>
                  </div>

                  <div className={`diary-status ${isDraft ? 'diary-status--draft' : 'diary-status--done'} diary-status--col`}>
                    {isDraft ? (
                      <>
                        <Timer size={13} aria-hidden /> Черновик
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} aria-hidden /> Завершена
                      </>
                    )}
                  </div>
                  {!isDraft && data.pre_weight_kg ? (
                    <p className="diary-card__weight muted">
                      <strong>Вес:</strong> {data.pre_weight_kg} кг
                    </p>
                  ) : null}
                  {hrSnap?.avg ? (
                    <p className="diary-card__hr" title="Средний пульс сессии">
                      <Heart size={12} aria-hidden strokeWidth={2.25} fill="currentColor" />
                      ср. {hrSnap.avg}
                      {hrSnap.kcal_est != null ? ` · ~${hrSnap.kcal_est} ккал` : ''}
                    </p>
                  ) : null}
                </div>
              </div>

              <MembershipBanner training={t} memberships={memberships} allTrainings={trainings} />

              <div className="diary-card__footer">
                <div className="diary-card__footer-left">
                  {isDraft && !readOnly && (
                    <>
                      <Link to={`${workoutPrefix}/${t.id}${clubQs}`} className="diary-btn diary-btn--primary u-no-decoration">
                        <Play size={16} aria-hidden />
                        Продолжить
                      </Link>
                      <button type="button" className="diary-btn diary-btn--danger" onClick={() => deleteTraining(t.id)}>
                        <Trash2 size={16} aria-hidden />
                        Удалить
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {viewTraining && (
        <TrainingViewModal
          training={viewTraining}
          clientName={client.name}
          trainerName={user?.name}
          membership={membershipForTrainingDate(
            viewTraining.date,
            memberships,
            viewTraining,
            trainings,
          )}
          dateLabel={formatDiaryDate(viewTraining.date)}
          onClose={() => setViewTraining(null)}
        />
      )}
    </div>
  )
}
