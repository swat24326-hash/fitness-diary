import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Trash2, Trophy } from 'lucide-react'
import { CloseButton } from '../../components/CloseButton'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  dispatchLocalDataChanged,
  listChallengesForClub,
  listExercises,
  ensureExercisesCached,
  buildChallengeLeaderboard,
  loadContextForChallengeLeaderboard,
  pullChallengeTrainingsForClubChallenges,
  saveNewChallenge,
  validateChallengeDraft,
  deleteChallengeById,
  formatChallengeMetricRu,
  formatChallengeValueRu,
  normalizeChallengeReferenceWeight,
  CHALLENGE_METRICS,
} from '../../lib/dataAccess'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { useDebouncedStorageReload, shouldReloadAdminChallengesPage } from '../../lib/useDebouncedStorageReload'
import { stripDirectionControls } from '../../lib/textInput'

const TABS = [
  { id: 'active', label: 'Активные' },
  { id: 'completed', label: 'Завершённые' },
  { id: 'all', label: 'Все' },
]

function statusLabel(status) {
  if (status === 'completed') return 'Завершён'
  if (status === 'cancelled') return 'Отменён'
  return 'Активен'
}

function statusClass(status) {
  if (status === 'completed') return 'challenge-pill challenge-pill--done'
  if (status === 'cancelled') return 'challenge-pill challenge-pill--muted'
  return 'challenge-pill challenge-pill--live'
}

export function AdminChallenges() {
  const ctx = useOutletContext()
  const [search] = useSearchParams()
  const clubIdCtx = ctx?.clubId ?? ''
  const clubId = search.get('club') ?? clubIdCtx ?? ''

  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''

  const [tab, setTab] = useState('active')
  const [busy, setBusy] = useState(false)
  const [challenges, setChallenges] = useState([])
  const [exercises, setExercises] = useState([])
  const [pullNote, setPullNote] = useState('')
  const [previews, setPreviews] = useState({})
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    exercise_id: '',
    metric: 'max_weight',
    useReferenceWeight: false,
    reference_weight_kg: '',
    start_date: '',
    end_date: '',
  })
  const [saveMsg, setSaveMsg] = useState('')
  const [exercisesModalBusy, setExercisesModalBusy] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState(null)

  const loadExercises = useCallback(async () => {
    await ensureExercisesCached()
    const list = await listExercises()
    setExercises(Array.isArray(list) ? list : [])
    return Array.isArray(list) ? list : []
  }, [])

  const reload = useCallback(async ({ pullRemote = false, silent = false } = {}) => {
    if (!clubId) {
      setChallenges([])
      setPreviews({})
      setPullNote('')
      return
    }
    if (!silent) setBusy(true)
    setPullNote('')
    try {
      const { challenges: rows, pull } = await listChallengesForClub(clubId, { pullRemote })
      setChallenges(rows ?? [])
      if (pull && !pull.ok && pull.error) setPullNote(String(pull.error))
      else if (pull && !pull.ok && pull.reason === 'no_club_or_supabase') setPullNote('')
      await loadExercises()

      if (pullRemote && (rows ?? []).length > 0) {
        try {
          await pullChallengeTrainingsForClubChallenges(clubId, rows, { notify: false })
        } catch (e) {
          console.warn('[admin] challenge trainings pull', e)
        }
      }

      const next = {}
      for (const ch of rows ?? []) {
        const lbCtx = await loadContextForChallengeLeaderboard(clubId, { challenge: ch, pullRemote: false, notifyPull: false })
        const { rows: r } = buildChallengeLeaderboard(ch, lbCtx)
        const leader = r[0]
        next[ch.id] = {
          participants: r.length,
          leaderName: leader?.client_name ?? null,
          leaderValue: leader?.value ?? null,
        }
      }
      setPreviews(next)
    } catch {
      setChallenges([])
      setPreviews({})
    } finally {
      if (!silent) setBusy(false)
    }
  }, [clubId, loadExercises])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => reload({ silent: true, pullRemote: false }), { shouldRun: shouldReloadAdminChallengesPage })

  const filtered = useMemo(() => {
    return (challenges ?? []).filter((c) => {
      if (tab === 'all') return true
      if (tab === 'completed') return c.status === 'completed'
      if (tab === 'active') return c.status === 'active'
      return true
    })
  }, [challenges, tab])

  const exerciseNameById = useMemo(() => {
    const m = new Map()
    for (const ex of exercises) m.set(ex.id, ex.name?.trim() || '—')
    return m
  }, [exercises])

  const onDeleteChallenge = async (ch) => {
    if (!ch?.id) return
    if (!window.confirm(`Удалить челлендж «${ch.name}»? Восстановить запись будет нельзя.`)) return
    setDeleteBusyId(ch.id)
    try {
      await deleteChallengeById(ch.id)
      dispatchLocalDataChanged({ reason: 'challenge-deleted' })
      await reload()
    } catch (e) {
      alert(e?.message ?? 'Не удалось удалить')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const openCreate = async () => {
    setSaveMsg('')
    setExercisesModalBusy(true)
    setModal(true)
    const today = todayLocalIso()
    try {
      const list = await loadExercises()
      setForm({
        name: '',
        description: '',
        exercise_id: list[0]?.id ?? '',
        metric: 'max_weight',
        useReferenceWeight: false,
        reference_weight_kg: '',
        start_date: today,
        end_date: today,
      })
    } finally {
      setExercisesModalBusy(false)
    }
  }

  const submitCreate = async (e) => {
    e.preventDefault()
    setSaveMsg('')
    const reference_weight_kg =
      form.metric === 'max_reps' && form.useReferenceWeight
        ? normalizeChallengeReferenceWeight(form.metric, form.reference_weight_kg)
        : null
    if (form.metric === 'max_reps' && form.useReferenceWeight && reference_weight_kg == null) {
      setSaveMsg('Укажите вес для зачёта (кг)')
      return
    }
    const draft = {
      name: form.name,
      description: form.description,
      club_id: clubId,
      exercise_id: form.exercise_id,
      metric: form.metric,
      reference_weight_kg,
      start_date: form.start_date,
      end_date: form.end_date,
    }
    const v = validateChallengeDraft(draft)
    if (!v.ok) {
      setSaveMsg(v.message)
      return
    }
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const desc = stripDirectionControls(String(form.description ?? '')).trim()
    const row = {
      id,
      club_id: clubId,
      name: String(form.name).trim(),
      description: desc || null,
      exercise_id: form.exercise_id,
      metric: form.metric,
      reference_weight_kg,
      start_date: String(form.start_date).slice(0, 10),
      end_date: String(form.end_date).slice(0, 10),
      status: 'active',
      created_by: null,
      created_at: now,
    }
    try {
      const cloud = await saveNewChallenge(row)
      dispatchLocalDataChanged({ reason: 'challenge-created' })
      if (!cloud.cloudOk) {
        setSaveMsg(
          `Челлендж сохранён на этом устройстве, но в облако не ушёл: ${cloud.cloudError ?? 'ошибка'}. Нажмите Sync в шапке; затем Sync у тренера.`,
        )
        await reload()
        return
      }
      setModal(false)
      await reload()
    } catch (err) {
      setSaveMsg(err?.message ?? 'Не удалось сохранить')
    }
  }

  if (!clubId) {
    return (
      <section className="challenge-admin-shell" aria-labelledby="ch-admin-title">
        <h1 id="ch-admin-title" className="challenge-admin__h1">
          Челленджи
        </h1>
        <div className="challenge-empty-card">
          <Trophy size={40} aria-hidden className="challenge-empty-card__icon" />
          <p className="challenge-empty-card__title">Выберите клуб в шапке</p>
          <p className="muted" style={{ margin: 0 }}>
            Челленджи привязаны к клубу. Укажите «Клуб» в правом верхнем углу, затем откройте раздел снова.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="challenge-admin-shell" aria-labelledby="ch-admin-title">
      <div className="challenge-admin__head">
        <div>
          <h1 id="ch-admin-title" className="challenge-admin__h1">
            Челленджи
          </h1>
          <p className="muted challenge-admin__lead">Соревнования по упражнению за период — рейтинг из завершённых тренировок.</p>
        </div>
        <div className="challenge-admin__actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reload({ pullRemote: true })} title="Обновить с сервера">
            <RefreshCw size={18} className={busy ? 'spin' : ''} aria-hidden />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void openCreate()}>
            <Plus size={18} aria-hidden />
            Создать
          </button>
        </div>
      </div>

      {pullNote ? (
        <p className="challenge-banner challenge-banner--warn" role="status">
          {pullNote}
        </p>
      ) : null}
      {!isSupabaseConfigured() ? (
        <p className="challenge-banner" role="note">
          Локальный режим: челленджи сохраняются в этом браузере и попадут в Supabase при синхронизации.
        </p>
      ) : null}

      <div className="challenge-tabs" role="tablist" aria-label="Фильтр статуса">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`challenge-tabs__btn${tab === t.id ? ' challenge-tabs__btn--on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="challenge-card-list os-enter">
        {filtered.length === 0 ? (
          <li className="challenge-empty-card challenge-empty-card--inline">
            <p style={{ margin: 0 }}>Пока нет челленджей в этом фильтре.</p>
          </li>
        ) : (
          filtered.map((ch) => {
            const exName = exerciseNameById.get(ch.exercise_id) ?? '—'
            const pv = previews[ch.id]
            return (
              <li key={ch.id} className="challenge-list-card">
                <div className="challenge-list-card__top">
                  <span className={statusClass(ch.status)}>{statusLabel(ch.status)}</span>
                  <div className="challenge-list-card__actions">
                    <Link className="btn btn-sm btn-primary" to={`/admin/challenges/${ch.id}${clubQs}`}>
                      Рейтинг
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost td-client-delete challenge-list-card__delete"
                      disabled={deleteBusyId === ch.id}
                      aria-label={`Удалить челлендж ${ch.name}`}
                      title="Удалить"
                      onClick={() => void onDeleteChallenge(ch)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
                <h2 className="challenge-list-card__title">{ch.name}</h2>
                {ch.description?.trim() ? (
                  <p className="challenge-list-card__description muted">{ch.description.trim()}</p>
                ) : null}
                <p className="challenge-list-card__meta">
                  <span>{exName}</span>
                  <span className="challenge-list-card__dot" aria-hidden>
                    ·
                  </span>
                  <span>{formatChallengeMetricRu(ch.metric, ch.reference_weight_kg)}</span>
                </p>
                <p className="muted challenge-list-card__dates">
                  {formatDateRu(ch.start_date)} — {formatDateRu(ch.end_date)}
                </p>
                {pv ? (
                  <p className="challenge-list-card__stats">
                    Участников: <strong>{pv.participants}</strong>
                    {pv.leaderName ? (
                      <>
                        {' '}
                        · Лидер: <strong>{pv.leaderName}</strong>
                        {pv.leaderValue != null ? ` (${formatChallengeValueRu(ch.metric, pv.leaderValue)})` : ''}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </li>
            )
          })
        )}
      </ul>

      {modal ? (
        <div className="modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal challenge-modal" role="dialog" aria-modal="true" aria-labelledby="ch-modal-title">
            <div className="challenge-modal__head">
              <h2 id="ch-modal-title">Новый челлендж</h2>
              <CloseButton onClick={() => setModal(false)} />
            </div>
            <form onSubmit={submitCreate} className="challenge-modal__form">
              <label className="field">
                <span className="field__label">Название</span>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Например, Майский жим ногами"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Описание</span>
                <textarea
                  className="textarea challenge-modal__textarea"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: stripDirectionControls(e.target.value) }))}
                  placeholder="Правила, призы, что учитывается в зачёте…"
                  maxLength={4000}
                />
              </label>
              <label className="field">
                <span className="field__label">Упражнение</span>
                <select
                  className="input"
                  value={form.exercise_id}
                  disabled={exercisesModalBusy}
                  onChange={(e) => setForm((f) => ({ ...f, exercise_id: e.target.value }))}
                >
                  {exercisesModalBusy ? (
                    <option value="">Загрузка справочника…</option>
                  ) : exercises.length === 0 ? (
                    <option value="">Справочник пуст</option>
                  ) : null}
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
                {!exercisesModalBusy && exercises.length === 0 ? (
                  <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45 }}>
                    Сначала заведите упражнения в разделе{' '}
                    <Link
                      to={`/admin/structure${clubQs ? `${clubQs}&` : '?'}tab=exercises`}
                      className="u-no-decoration"
                      style={{ color: 'var(--accent-bright, #2effb8)' }}
                    >
                      Упражнения
                    </Link>
                    {isSupabaseConfigured() ? ' (при онлайне список подтягивается из Supabase).' : ' (локально — добавьте вручную).'}
                  </p>
                ) : null}
              </label>
              <label className="field">
                <span className="field__label">Показатель</span>
                <select
                  className="input"
                  value={form.metric}
                  onChange={(e) => {
                    const metric = e.target.value
                    setForm((f) => ({
                      ...f,
                      metric,
                      ...(metric !== 'max_reps' ? { useReferenceWeight: false, reference_weight_kg: '' } : {}),
                    }))
                  }}
                >
                  {CHALLENGE_METRICS.map((id) => (
                    <option key={id} value={id}>
                      {formatChallengeMetricRu(id)}
                    </option>
                  ))}
                </select>
              </label>
              {form.metric === 'max_reps' ? (
                <div className="challenge-modal__reps-weight">
                  <label className="challenge-modal__check">
                    <input
                      type="checkbox"
                      checked={form.useReferenceWeight}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          useReferenceWeight: e.target.checked,
                          ...(e.target.checked ? {} : { reference_weight_kg: '' }),
                        }))
                      }
                    />
                    <span>Зачёт только при заданном весе (жим, присед и т.п.)</span>
                  </label>
                  {form.useReferenceWeight ? (
                    <label className="field">
                      <span className="field__label">Вес для зачёта, кг</span>
                      <input
                        className="input"
                        type="number"
                        min="0.5"
                        step="0.5"
                        inputMode="decimal"
                        placeholder="100"
                        value={form.reference_weight_kg}
                        onChange={(e) => setForm((f) => ({ ...f, reference_weight_kg: e.target.value }))}
                        required={form.useReferenceWeight}
                      />
                    </label>
                  ) : (
                    <p className="muted challenge-modal__reps-hint">
                      Без галочки — лучший подход по числу повторений при любом весе (подтягивания, отжимания со своим весом).
                    </p>
                  )}
                </div>
              ) : null}
              <div className="challenge-modal__row">
                <label className="field">
                  <span className="field__label">Начало</span>
                  <input className="input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
                </label>
                <label className="field">
                  <span className="field__label">Окончание</span>
                  <input className="input" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
                </label>
              </div>
              {saveMsg ? <p className="form-error">{saveMsg}</p> : null}
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Рейтинг строится из завершённых тренировок за период. Для «макс. повторений» с весом учитываются только подходы с этим весом (±0,5 кг).
              </p>
              <div className="challenge-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary" disabled={!exercises.length || exercisesModalBusy}>
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
