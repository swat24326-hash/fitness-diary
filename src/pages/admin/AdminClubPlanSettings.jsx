import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Pencil, Save } from 'lucide-react'
import {
  defaultTrainerPayPlanConfig,
  describeTrainerPayPlanBands,
  normalizeTrainerPayPlanConfig,
  validateTrainerPayPlanConfigForSave,
} from '../../lib/admin/trainerPayPlanCore.js'
import {
  fetchTrainerPayPlanSettings,
  saveTrainerPayPlanSettings,
} from '../../lib/admin/trainerPayPlanSettingsService.js'

function configToDraft(config) {
  const c = normalizeTrainerPayPlanConfig(config)
  return {
    workouts_l2_min: String(c.workouts_l2_min),
    workouts_l3_min: String(c.workouts_l3_min),
  }
}

/**
 * Структура → План ЗП: пороги тренировок месяца для уровней 1–3.
 * Клуб — из шапки (`?club=`), отдельный выбор не нужен.
 */
export function AdminClubPlanSettings() {
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''
  const [draft, setDraft] = useState(() => configToDraft(defaultTrainerPayPlanConfig()))
  const [savedDraft, setSavedDraft] = useState(() => configToDraft(defaultTrainerPayPlanConfig()))
  const [editing, setEditing] = useState(false)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [usingDefaults, setUsingDefaults] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const draftCheck = useMemo(() => validateTrainerPayPlanConfigForSave(draft), [draft])
  const bands = useMemo(
    () => (draftCheck.ok ? describeTrainerPayPlanBands(draftCheck.config) : null),
    [draftCheck],
  )
  const canSave = Boolean(clubId) && !busy && draftCheck.ok

  const applyLoaded = useCallback((config) => {
    const next = configToDraft(config)
    setDraft(next)
    setSavedDraft(next)
    setEditing(false)
  }, [])

  const load = useCallback(
    async (cid) => {
      if (!cid) return
      setBusy(true)
      setErr('')
      setMsg('')
      try {
        const data = await fetchTrainerPayPlanSettings(cid)
        applyLoaded(data?.config)
        setMigrationNeeded(Boolean(data?.migration_needed))
        setUsingDefaults(Boolean(data?.using_defaults))
      } catch (e) {
        setErr(e?.message ? String(e.message) : 'Не удалось загрузить')
      } finally {
        setBusy(false)
      }
    },
    [applyLoaded],
  )

  useEffect(() => {
    if (!clubId) {
      const empty = configToDraft(defaultTrainerPayPlanConfig())
      setDraft(empty)
      setSavedDraft(empty)
      setEditing(false)
      setMigrationNeeded(false)
      setUsingDefaults(false)
      setErr('')
      setMsg('')
      return
    }
    void load(clubId)
  }, [clubId, load])

  const setWorkouts = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  const onEdit = () => {
    setErr('')
    setMsg('')
    setEditing(true)
  }

  const onCancel = () => {
    setDraft(savedDraft)
    setEditing(false)
    setErr('')
    setMsg('')
  }

  const onSave = async () => {
    if (!clubId || !draftCheck.ok) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const data = await saveTrainerPayPlanSettings(clubId, { config: draftCheck.config })
      applyLoaded(data?.config ?? draftCheck.config)
      setUsingDefaults(false)
      setMigrationNeeded(false)
      setMsg('Пороги тренировок сохранены')
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const typesHref = clubId
    ? `/admin/structure?tab=membership-types&club=${encodeURIComponent(clubId)}`
    : '/admin/structure?tab=membership-types'

  if (!clubId) {
    return (
      <section className="admin-club-plan">
        <p className="muted">Выберите клуб в шапке.</p>
      </section>
    )
  }

  const trainersHref = `/admin/structure?tab=trainers&club=${encodeURIComponent(clubId)}`
  const fieldsLocked = !editing || busy

  return (
    <section className="admin-club-plan" aria-labelledby="admin-club-plan-title">
      {migrationNeeded ? (
        <p className="admin-section__banner admin-section__banner--warn">
          Таблица в базе ещё не создана — сейчас действуют стартовые пороги (80 / 120). После миграции{' '}
          <code>club_trainer_pay_plan_settings</code> сохранение заработает.
        </p>
      ) : null}

      {usingDefaults && !migrationNeeded ? (
        <p className="muted admin-club-plan__note">
          Для клуба ещё нет своей записи — показаны стартовые 80 / 120 трен. Сохраните, чтобы закрепить.
        </p>
      ) : null}

      {err ? (
        <p className="admin-section__banner admin-section__banner--warn" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="admin-section__banner" role="status">
          {msg}
        </p>
      ) : null}

      <div className="admin-club-plan__card">
        <div className="admin-club-plan__card-head">
          <h2 id="admin-club-plan-title" className="admin-club-plan__card-title">
            Пороги тренировок месяца
          </h2>
          <div className="admin-club-plan__card-actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-touch"
                  disabled={busy}
                  onClick={onCancel}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-touch"
                  disabled={!canSave}
                  onClick={() => void onSave()}
                >
                  <Save size={16} aria-hidden />
                  Сохранить
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-touch admin-club-plan__edit-btn"
                disabled={busy}
                onClick={onEdit}
                aria-label="Редактировать пороги"
                title="Редактировать"
              >
                <Pencil size={16} aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="admin-club-plan__fields">
          <label className="field">
            <span className="label">С скольких тренировок — уровень 2</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.workouts_l2_min}
              readOnly={fieldsLocked}
              disabled={busy}
              onChange={(e) => setWorkouts('workouts_l2_min', e.target.value)}
              aria-label="Порог тренировок уровня 2"
            />
          </label>
          <label className="field">
            <span className="label">С скольких тренировок — уровень 3</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.workouts_l3_min}
              readOnly={fieldsLocked}
              disabled={busy}
              onChange={(e) => setWorkouts('workouts_l3_min', e.target.value)}
              aria-label="Порог тренировок уровня 3"
            />
          </label>
        </div>

        {!draftCheck.ok ? (
          <p className="admin-club-plan__hint admin-club-plan__hint--warn">{draftCheck.error}</p>
        ) : bands ? (
          <ul className="admin-club-plan__bands" aria-label="Полосы уровней">
            <li>
              <strong>Ур. 1</strong> — {bands.l1}
            </li>
            <li>
              <strong>Ур. 2</strong> — {bands.l2}
            </li>
            <li>
              <strong>Ур. 3</strong> — {bands.l3}
            </li>
          </ul>
        ) : null}

        <p className="muted admin-club-plan__footer">
          <Link to={typesHref}>Типы абон.</Link>
          {' · '}
          <Link to={trainersHref}>Тренеры → кабинет</Link>
        </p>
      </div>
    </section>
  )
}
