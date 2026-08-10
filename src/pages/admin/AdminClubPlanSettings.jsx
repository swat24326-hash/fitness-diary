import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Dumbbell, Save } from 'lucide-react'
import { AdminSectionHeader } from '../../components/admin/AdminSectionHeader.jsx'
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
  const [clubName, setClubName] = useState('')
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

  const load = useCallback(async (cid) => {
    if (!cid) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const data = await fetchTrainerPayPlanSettings(cid)
      setDraft(configToDraft(data?.config))
      setClubName(String(data?.club_name ?? ''))
      setMigrationNeeded(Boolean(data?.migration_needed))
      setUsingDefaults(Boolean(data?.using_defaults))
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось загрузить')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!clubId) {
      setDraft(configToDraft(defaultTrainerPayPlanConfig()))
      setClubName('')
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

  const onSave = async () => {
    if (!clubId || !draftCheck.ok) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const data = await saveTrainerPayPlanSettings(clubId, { config: draftCheck.config })
      setDraft(configToDraft(data?.config ?? draftCheck.config))
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
        <AdminSectionHeader
          title="План ЗП"
          lead="Сколько тренировок в календарном месяце нужно для уровня 2 и 3."
          icon={Dumbbell}
        />
        <p className="muted">Выберите клуб в шапке — настройки плана относятся к выбранному филиалу.</p>
      </section>
    )
  }

  const trainersHref = `/admin/structure?tab=trainers&club=${encodeURIComponent(clubId)}`
  const lead = clubName
    ? `Филиал «${clubName}». Пороги тренировок для уровней 2 и 3. Ставки ₽ — в Типы абон.; план/±₽ сотрудника — в Тренеры → кабинет.`
    : 'Пороги тренировок для уровней 2 и 3. Ставки ₽ — в Типы абон.; план/±₽ сотрудника — в Тренеры → кабинет.'

  return (
    <section className="admin-club-plan" aria-labelledby="admin-club-plan-title">
      <AdminSectionHeader title="План ЗП" lead={lead} icon={Dumbbell}>
        <button type="button" className="btn btn-primary btn-touch" disabled={!canSave} onClick={() => void onSave()}>
          <Save size={16} aria-hidden />
          Сохранить
        </button>
      </AdminSectionHeader>

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
        <h2 className="admin-club-plan__card-title">Пороги тренировок месяца</h2>
        <p className="muted admin-club-plan__card-lead">
          Считаются завершённые тренировки персонального зала за календарный месяц по типам карт с галочкой
          «В план» в «Типы абон.» (ставки ₽ и галочка — раздельно). Без плана у сотрудника позже всегда будет
          уровень 3 — это в кабинете сотрудника.
        </p>

        <div className="admin-club-plan__fields">
          <label className="field">
            <span className="label">С скольких тренировок — уровень 2</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.workouts_l2_min}
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
          Рубли за тренировку — в <Link to={typesHref}>Типы абон.</Link>. План и надбавка тренера —{' '}
          <Link to={trainersHref}>Тренеры → кабинет</Link> (иконка кошелька). ЗП считает уровни и ±₽ автоматически.
        </p>
      </div>
    </section>
  )
}
