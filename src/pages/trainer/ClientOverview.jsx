import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Pencil, RefreshCw } from 'lucide-react'
import { hydrateAdminClientWorkspace } from '../../lib/admin/adminClientHydrate'
import { getHealthCard, listMeasurements, listMemberships, listTrainingsForClient } from '../../lib/dataAccess'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'
import { isSupabaseConfigured } from '../../lib/supabase'
import { stripDirectionControls } from '../../lib/textInput'
import { saveLocalWithSync } from '../../lib/syncService'
import {
  formatWeightProgressDelta,
  getHealthCurrentWeightKg,
  getHealthInitialWeightKg,
  normalizeHealthCardWeights,
  listTrainingPreWeights,
  sortWeightEntriesDesc,
  weightEntrySourceLabelRu,
} from '../../lib/clientWeightCore'
import { getHealthFilledAt, getHealthSex } from '../../lib/healthCardCore'
import { ClientWeightChart } from '../../components/ClientWeightChart'
import {
  listWeightEntries,
  importWeightsFromAllTrainings,
  saveHealthCardWithWeightFields,
} from '../../lib/clientWeightService'
import { BmiScaleBar } from '../../components/BmiScaleBar'
import { AppToast } from '../../components/AppToast'
import { CloseButton } from '../../components/CloseButton'
import { MembershipManager } from '../../components/MembershipManager'
import { ModalHeader } from '../../components/ModalHeader'
import { calcBmiFromHeightWeight, getBmiMeta } from '../../lib/bmiScaleCore'
import { useAppToast } from '../../hooks/useAppToast'
import { isNutritionPlanStale, nutritionPlanStaleMessage } from '../../lib/nutrition/nutritionPlanStaleCore'
import { parseNutritionJsonField } from '../../lib/nutrition/nutritionPlanService'
import { needsWeightImportRefresh, pickLastWeightEntryDate } from '../../lib/weightImportCore'
import { BODY_MEASURE_FIELDS, getMeasureValue } from '../../lib/bodyMeasures'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { explainInactiveMembership, pickUsableMembershipForDate, countedUsedTrainingsOnMembership } from '../../lib/membershipRules'

export function ClientOverview({ client, onReload, section = 'all', readOnly = false }) {
  const location = useLocation()
  const { showToast, toast } = useAppToast()
  const [memberships, setMemberships] = useState([])
  const [clientTrainings, setClientTrainings] = useState([])
  const [health, setHealth] = useState(null)
  const [healthForm, setHealthForm] = useState({
    height_cm: '',
    initial_weight_kg: '',
    sex: '',
    health_filled_at: todayLocalIso(),
    goal: '',
    diseases: '',
    contraindications: '',
    medications: '',
    notes: '',
  })
  const [healthEditing, setHealthEditing] = useState(false)
  const [measurements, setMeasurements] = useState([])
  const [weightEntries, setWeightEntries] = useState([])
  const [showWeightHistory, setShowWeightHistory] = useState(false)
  const [weightImportBusy, setWeightImportBusy] = useState(false)
  const [showMeasure, setShowMeasure] = useState(false)
  const [editingMeasureId, setEditingMeasureId] = useState(null)
  const [showMeasureHistory, setShowMeasureHistory] = useState(false)
  const formEditRef = useRef({ health: false, measure: false })
  const [measureForm, setMeasureForm] = useState({
    date: todayLocalIso(),
    neck: '',
    chest: '',
    arm_r: '',
    arm_l: '',
    waist_upper: '',
    waist_lower: '',
    glutes: '',
    thigh_r: '',
    thigh_l: '',
    calf_r: '',
    calf_l: '',
  })

  const reloadLocal = useCallback(async () => {
    const m = await listMemberships(client.id)
    setMemberships(m)
    setClientTrainings(await listTrainingsForClient(client.id))
    const hcRaw = await getHealthCard(client.id)
    const hc = normalizeHealthCardWeights(hcRaw)
    setHealth(hc)
    if (!formEditRef.current.health) {
      setHealthForm({
        height_cm: hc?.height_cm != null ? String(hc.height_cm) : '',
        initial_weight_kg:
          getHealthInitialWeightKg(hc) != null ? String(getHealthInitialWeightKg(hc)) : '',
        sex: getHealthSex(hc) ?? '',
        health_filled_at: getHealthFilledAt(hc) ?? todayLocalIso(),
        goal: stripDirectionControls(hc?.goal ?? ''),
        diseases: stripDirectionControls(hc?.diseases ?? ''),
        contraindications: stripDirectionControls(hc?.contraindications ?? ''),
        medications: stripDirectionControls(hc?.medications ?? ''),
        notes: stripDirectionControls(hc?.notes ?? ''),
      })
    }
    setMeasurements(await listMeasurements(client.id))
    setWeightEntries(await listWeightEntries(client.id, hc))
  }, [client.id])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal])

  useDebouncedStorageReload(() => reloadLocal(), {
    shouldRun: (d) => {
      if (formEditRef.current.health || formEditRef.current.measure) {
        return false
      }
      return d?.reason !== 'exercises' && d?.reason !== 'challenge-trainings'
    },
  })

  useEffect(() => {
    if (section !== 'health' && section !== 'all') return
    let cancelled = false
    ;(async () => {
      if (!isSupabaseConfigured() || !navigator.onLine) return
      const existing = await listMeasurements(client.id)
      const hc = await getHealthCard(client.id)
      if (cancelled || existing.length > 0 || hc) return
      const h = await hydrateAdminClientWorkspace(client.id, { allowBrowserFallback: false })
      if (!cancelled && h.ok) await reloadLocal()
    })()
    return () => {
      cancelled = true
    }
  }, [client.id, section, reloadLocal])

  const todayIso = useMemo(() => todayLocalIso(), [])
  const active = useMemo(() => pickUsableMembershipForDate(memberships, todayIso), [memberships, todayIso])
  const inactiveHint = useMemo(
    () => (active ? null : explainInactiveMembership(memberships, todayIso)),
    [active, memberships, todayIso],
  )

  const progressPct = useMemo(() => {
    if (!active?.total_trainings) return 0
    const u = countedUsedTrainingsOnMembership(active, clientTrainings)
    const t = active.total_trainings
    return Math.min(100, Math.round((u / t) * 100))
  }, [active, clientTrainings])

  const activeUsedCount = useMemo(
    () => (active ? countedUsedTrainingsOnMembership(active, clientTrainings) : 0),
    [active, clientTrainings],
  )

  const currentWeightKg = useMemo(() => getHealthCurrentWeightKg(health), [health])
  const initialWeightKg = useMemo(() => getHealthInitialWeightKg(health), [health])
  const weightProgress = useMemo(() => formatWeightProgressDelta(health), [health])
  const trainingWeights = useMemo(() => listTrainingPreWeights(clientTrainings), [clientTrainings])

  const bmi = useMemo(
    () =>
      calcBmiFromHeightWeight(
        healthForm.height_cm,
        currentWeightKg ?? healthForm.initial_weight_kg,
      ),
    [healthForm.height_cm, healthForm.initial_weight_kg, currentWeightKg],
  )

  const bmiMeta = useMemo(() => getBmiMeta(bmi), [bmi])

  const sortedWeightEntries = useMemo(() => sortWeightEntriesDesc(weightEntries), [weightEntries])

  const healthSexLabel = useMemo(() => {
    const sex = getHealthSex(health)
    if (sex === 'male') return 'Мужской'
    if (sex === 'female') return 'Женский'
    return '—'
  }, [health])

  const healthFilledAtLabel = useMemo(() => {
    const d = getHealthFilledAt(health)
    return d ? formatDateRu(d) : '—'
  }, [health])

  const nutritionTabHref = useMemo(() => `${location.pathname}?tab=nutrition`, [location.pathname])
  const savedNutritionPlan = useMemo(() => parseNutritionJsonField(health?.nutrition_plan), [health?.nutrition_plan])
  const nutritionStaleMessage = useMemo(
    () => nutritionPlanStaleMessage(health, savedNutritionPlan),
    [health, savedNutritionPlan],
  )
  const showNutritionStale = useMemo(
    () => Boolean(savedNutritionPlan && isNutritionPlanStale(health, savedNutritionPlan) && nutritionStaleMessage),
    [health, savedNutritionPlan, nutritionStaleMessage],
  )
  const weightImportPending = useMemo(
    () => needsWeightImportRefresh(trainingWeights, weightEntries),
    [trainingWeights, weightEntries],
  )
  const lastWeightDateLabel = useMemo(() => {
    const iso = pickLastWeightEntryDate(weightEntries)
    return iso ? formatDateRu(iso) : null
  }, [weightEntries])

  const cancelHealthEdit = useCallback(() => {
    formEditRef.current.health = false
    setHealthEditing(false)
    void reloadLocal()
  }, [reloadLocal])

  const saveHealth = async (e) => {
    e.preventDefault()
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    const toNumOrNull = (v) => {
      const n = Number(String(v ?? '').replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    try {
      await saveHealthCardWithWeightFields(client.id, health, {
        height_cm: toNumOrNull(healthForm.height_cm),
        initial_weight_kg: healthForm.initial_weight_kg,
        sex: healthForm.sex || null,
        health_filled_at: healthForm.health_filled_at || null,
        goal: healthForm.goal || null,
        diseases: healthForm.diseases || null,
        contraindications: healthForm.contraindications || null,
        medications: healthForm.medications || null,
        notes: healthForm.notes || null,
      })
    } catch (err) {
      alert(err?.message ?? 'Ошибка сохранения медкарты')
      return
    }
    setHealthEditing(false)
    formEditRef.current.health = false
    await reloadLocal()
    onReload?.()
  }

  const applyWeightsFromTrainings = useCallback(
    async (opts = {}) => {
      if (readOnly || weightImportBusy) {
        if (readOnly) alert('Клиент в архиве — изменения недоступны.')
        return null
      }
      setWeightImportBusy(true)
      try {
        const result = await importWeightsFromAllTrainings(client.id, health, clientTrainings)
        await reloadLocal()
        onReload?.()
        if (opts.toast !== false) showToast(`Подтянуто весов: ${result.imported}`)
        return result
      } catch (err) {
        alert(err?.message ?? 'Не удалось подгрузить веса с тренировок')
        return null
      } finally {
        setWeightImportBusy(false)
      }
    },
    [client.id, health, clientTrainings, readOnly, weightImportBusy, reloadLocal, onReload, showToast],
  )

  const openWeightHistory = useCallback(async () => {
    setShowWeightHistory(true)
    if (readOnly) return
    if (needsWeightImportRefresh(trainingWeights, weightEntries)) {
      await applyWeightsFromTrainings({ toast: true })
    }
  }, [readOnly, trainingWeights, weightEntries, applyWeightsFromTrainings])

  const saveMeasurement = async (e) => {
    e.preventDefault()
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    const id = editingMeasureId ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const prev = editingMeasureId ? measurements.find((m) => m.id === editingMeasureId) : null
    const row = {
      id,
      client_id: client.id,
      date: measureForm.date,
      neck: measureForm.neck ? Number(measureForm.neck) : null,
      chest: measureForm.chest ? Number(measureForm.chest) : null,
      arm_r: measureForm.arm_r ? Number(measureForm.arm_r) : null,
      arm_l: measureForm.arm_l ? Number(measureForm.arm_l) : null,
      waist_upper: measureForm.waist_upper ? Number(measureForm.waist_upper) : null,
      waist_lower: measureForm.waist_lower ? Number(measureForm.waist_lower) : null,
      glutes: measureForm.glutes ? Number(measureForm.glutes) : null,
      thigh_r: measureForm.thigh_r ? Number(measureForm.thigh_r) : null,
      thigh_l: measureForm.thigh_l ? Number(measureForm.thigh_l) : null,
      calf_r: measureForm.calf_r ? Number(measureForm.calf_r) : null,
      calf_l: measureForm.calf_l ? Number(measureForm.calf_l) : null,
      created_at: prev?.created_at ?? now,
    }
    try {
      await saveLocalWithSync('body_measurements', row, {
        table_name: 'body_measurements',
        operation: prev ? 'update' : 'insert',
        remote_id: prev ? row.id : null,
      })
    } catch (err) {
      alert(err?.message ?? 'Ошибка сохранения замера')
      return
    }
    setShowMeasure(false)
    formEditRef.current.measure = false
    setEditingMeasureId(null)
    await reloadLocal()
    onReload?.()
  }

  const lastM = measurements[0]
  const measureSummaryFields = useMemo(
    () => BODY_MEASURE_FIELDS.filter((f) => ['neck', 'chest', 'waist_upper', 'waist_lower', 'glutes', 'thigh_r', 'thigh_l'].includes(f.id)),
    [],
  )

  const openNewMeasurement = () => {
    if (readOnly) {
      alert('Клиент в архиве — изменения недоступны. Нажмите «Вернуть из архива».')
      return
    }
    setEditingMeasureId(null)
    setMeasureForm({
      date: todayLocalIso(),
      neck: '',
      chest: '',
      arm_r: '',
      arm_l: '',
      waist_upper: '',
      waist_lower: '',
      glutes: '',
      thigh_r: '',
      thigh_l: '',
      calf_r: '',
      calf_l: '',
    })
    setShowMeasure(true)
    formEditRef.current.measure = true
  }

  const openEditMeasurement = (m) => {
    setEditingMeasureId(m.id)
    const next = {
      date: m.date ?? todayLocalIso(),
    }
    for (const f of BODY_MEASURE_FIELDS) {
      const v = getMeasureValue(m, f.id)
      next[f.id] = v != null && v !== '' ? String(v) : ''
    }
    setMeasureForm((prevF) => ({ ...prevF, ...next }))
    setShowMeasure(true)
    formEditRef.current.measure = true
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {(section === 'all' || section === 'memberships') && (
        <section className="card">
        <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
          Абонемент
        </h2>
        {!active && <p className="muted">{inactiveHint}</p>}
        {active && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Действует до <strong style={{ color: 'var(--accent-bright)' }}>{formatDateRu(active.end_date)}</strong>
            </p>
            <p style={{ margin: '4px 0 10px' }}>
              Использовано тренировок:{' '}
              <strong>
                {activeUsedCount} / {active.total_trainings ?? '—'}
              </strong>
            </p>
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 10,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-dim), var(--accent-bright))' }} />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Использовано {progressPct}% лимита
            </p>
          </>
        )}
        {!readOnly ? (
          <MembershipManager
            clientId={client.id}
            clubId={client.club_id}
            recordTrainerId={client.trainer_id}
            onChanged={() => {
              void reloadLocal()
              void onReload?.()
            }}
          />
        ) : (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Клиент в архиве — абонементы можно менять только после «Вернуть из архива».
          </p>
        )}
        </section>
      )}

      {(section === 'all' || section === 'health') && (
        <section className="card">
        <div className="row">
          <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
            Карта здоровья
          </h2>
          {!readOnly && !healthEditing ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon-square"
              aria-label="Редактировать карту здоровья"
              title="Редактировать"
              onClick={() => {
                formEditRef.current.health = true
                setHealthEditing(true)
              }}
            >
              <Pencil size={16} aria-hidden />
            </button>
          ) : null}
          {!readOnly && healthEditing ? <CloseButton onClick={cancelHealthEdit} aria-label="Отменить редактирование" /> : null}
        </div>
        {showNutritionStale ? (
          <section className="card nutrition-stale-banner" role="status" style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>{nutritionStaleMessage}</p>
            <Link to={nutritionTabHref} className="btn btn-ghost btn-xs" style={{ marginTop: 10 }}>
              Открыть «Питание»
            </Link>
          </section>
        ) : null}
        {!healthEditing ? (
          <div className="grid health-mini">
            <div className="health-mini__top">
              <div className="health-mini__metric">
                <span className="muted">Пол</span>
                <strong>{healthSexLabel}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">Дата карты</span>
                <strong>{healthFilledAtLabel}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">Рост</span>
                <strong>{healthForm.height_cm ? `${healthForm.height_cm} см` : '—'}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">Исходный вес</span>
                <strong>{initialWeightKg != null ? `${initialWeightKg} кг` : '—'}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">Текущий вес</span>
                <strong>{currentWeightKg != null ? `${currentWeightKg} кг` : '—'}</strong>
              </div>
              <div className="health-mini__metric">
                <span className="muted">ИМТ</span>
                <strong style={{ color: bmiMeta?.color ?? 'var(--text)' }}>
                  {bmi != null ? bmi : '—'}
                  {bmiMeta ? ` · ${bmiMeta.label}` : ''}
                </strong>
              </div>
            </div>
            {weightProgress ? (
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                {weightProgress.text}
              </p>
            ) : null}
            {!readOnly ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => void openWeightHistory()}>
                  История веса{weightEntries.length > 0 ? ` (${weightEntries.length})` : ''}
                  {weightImportPending ? (
                    <span className="weight-import-badge" title="Есть веса с тренировок" aria-hidden />
                  ) : null}
                </button>
                {lastWeightDateLabel ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Последний вес: {lastWeightDateLabel}
                  </span>
                ) : null}
              </div>
            ) : weightEntries.length > 0 ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => void openWeightHistory()}>
                  История веса ({weightEntries.length})
                </button>
                {lastWeightDateLabel ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Последний вес: {lastWeightDateLabel}
                  </span>
                ) : null}
              </div>
            ) : null}

            <BmiScaleBar bmi={bmi} />
            <div className="health-mini__details">
              <p>
                <span className="muted">Цель:</span> {healthForm.goal || '—'}
              </p>
              <p>
                <span className="muted">Заболевания:</span> {healthForm.diseases || '—'}
              </p>
              <p>
                <span className="muted">Противопоказания:</span> {healthForm.contraindications || '—'}
              </p>
              <p>
                <span className="muted">Препараты:</span> {healthForm.medications || '—'}
              </p>
              <p className="health-mini__details-wide">
                <span className="muted">Заметки:</span> {healthForm.notes || '—'}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={saveHealth} className="grid health-form">
            <div className="grid grid-2 health-form__metrics">
              <div className="field">
                <label className="label">Дата составления карты</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={healthForm.health_filled_at}
                  onChange={(e) => setHealthForm((f) => ({ ...f, health_filled_at: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="label">Пол</label>
                <select
                  className="input"
                  required
                  value={healthForm.sex || ''}
                  onChange={(e) => setHealthForm((f) => ({ ...f, sex: e.target.value }))}
                >
                  <option value="" disabled>
                    Выберите
                  </option>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Рост (см)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Напр. 178"
                  value={healthForm.height_cm}
                  onChange={(e) => setHealthForm((f) => ({ ...f, height_cm: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="label">Исходный вес (кг)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Напр. 82.5"
                  value={healthForm.initial_weight_kg}
                  onChange={(e) => setHealthForm((f) => ({ ...f, initial_weight_kg: e.target.value }))}
                />
              </div>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Исходный вес — первая точка на графике (до первой тренировки). Текущий вес:{' '}
              <strong>{currentWeightKg != null ? `${currentWeightKg} кг` : '—'}</strong> — подгружается из истории
              тренировок в разделе «История веса».
            </p>
            <div className="health-form__bmi">
              <div className="health-form__bmi-row">
                <span className="muted">ИМТ</span>
                <strong style={{ color: bmiMeta?.color ?? 'var(--text)' }}>{bmi != null ? bmi : '—'}</strong>
                <span className="muted">{bmiMeta ? bmiMeta.label : ''}</span>
              </div>
              <BmiScaleBar bmi={bmi} />
            </div>
            <div className="field">
              <label className="label">Цель</label>
              <textarea
                className="textarea"
                value={healthForm.goal}
                onChange={(e) => setHealthForm((f) => ({ ...f, goal: stripDirectionControls(e.target.value) }))}
                placeholder="Напр. Снижение веса, набор массы, улучшить выносливость..."
              />
            </div>
            <div className="field">
              <label className="label">Заболевания</label>
              <textarea className="textarea" value={healthForm.diseases} onChange={(e) => setHealthForm((f) => ({ ...f, diseases: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Противопоказания</label>
              <textarea className="textarea" value={healthForm.contraindications} onChange={(e) => setHealthForm((f) => ({ ...f, contraindications: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Препараты</label>
              <textarea className="textarea" value={healthForm.medications} onChange={(e) => setHealthForm((f) => ({ ...f, medications: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Заметки</label>
              <textarea className="textarea" value={healthForm.notes} onChange={(e) => setHealthForm((f) => ({ ...f, notes: stripDirectionControls(e.target.value) }))} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary btn-touch">
                Сохранить
              </button>
            </div>
          </form>
        )}
        </section>
      )}

      {(section === 'all' || section === 'health') && (
        <section className="card">
        <div className="row">
          <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
            Обмеры тела (последние)
          </h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {measurements.length > 1 ? (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowMeasureHistory(true)}>
                История ({measurements.length})
              </button>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                className="btn btn-primary btn-icon-square"
                onClick={openNewMeasurement}
                aria-label="Новый замер"
                title="Новый замер"
              >
                <Plus size={20} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        {!lastM && <p className="muted">Нет замеров.</p>}
        {lastM && (
          <div className="measure-summary" style={{ marginTop: 10 }}>
            <div className="measure-summary__top">
              <div className="muted" style={{ margin: 0 }}>
                Дата: <strong style={{ color: 'var(--text)' }}>{formatDateRu(lastM.date)}</strong>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square"
                  aria-label="Редактировать замер"
                  title="Редактировать"
                  onClick={() => openEditMeasurement(lastM)}
                >
                  <Pencil size={16} aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="measure-grid">
              {measureSummaryFields.map((f) => (
                <div key={f.id} className="measure-tile">
                  <div className="measure-tile__label">{f.label}</div>
                  <div className="measure-tile__value">{getMeasureValue(lastM, f.id) ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        </section>
      )}

      {showWeightHistory && (section === 'all' || section === 'health') && (
        <div className="modal-overlay" onClick={() => setShowWeightHistory(false)}>
          <div className="modal-panel measure-history-panel" onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="История веса" onClose={() => setShowWeightHistory(false)}>
              {!readOnly && trainingWeights.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-icon-square weight-history-sync-btn"
                  onClick={() => void applyWeightsFromTrainings()}
                  disabled={weightImportBusy}
                  title={`Подгрузить веса с тренировок (${trainingWeights.length})`}
                  aria-label={`Подгрузить веса с тренировок (${trainingWeights.length})`}
                  aria-busy={weightImportBusy}
                >
                  <RefreshCw size={18} className={weightImportBusy ? 'icon-spin' : undefined} aria-hidden />
                </button>
              ) : null}
            </ModalHeader>
            <ClientWeightChart entries={weightEntries} height={220} />
            {weightEntries.length === 0 ? (
              <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
                {trainingWeights.length > 0 && !readOnly
                  ? 'Веса подгружаются автоматически при открытии. Можно обновить кнопкой синхронизации.'
                  : 'Записей пока нет.'}
              </p>
            ) : null}
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="measure-history-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Вес</th>
                    <th className="muted">Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWeightEntries.map((w) => (
                    <tr key={w.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateRu(w.date)}</td>
                      <td>
                        <strong>{w.weight_kg} кг</strong>
                      </td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {weightEntrySourceLabelRu(w.source)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showMeasureHistory && (section === 'all' || section === 'health') && (
        <div className="modal-overlay" onClick={() => setShowMeasureHistory(false)}>
          <div className="modal-panel measure-history-panel" onClick={(e) => e.stopPropagation()}>
            <ModalHeader title="История замеров" onClose={() => setShowMeasureHistory(false)} />
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="measure-history-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th className="muted">Кратко</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateRu(m.date)}</td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {BODY_MEASURE_FIELDS.slice(0, 4)
                          .map((f) => `${f.label}: ${getMeasureValue(m, f.id) ?? '—'}`)
                          .join(' · ')}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon-square"
                          aria-label="Редактировать замер"
                          title="Редактировать"
                          onClick={() => {
                            openEditMeasurement(m)
                            setShowMeasureHistory(false)
                          }}
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showMeasure && (section === 'all' || section === 'health') && (
        <div
          className="modal-overlay"
          onClick={() => {
            formEditRef.current.measure = false
            setShowMeasure(false)
          }}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              title={editingMeasureId ? 'Редактировать замер' : 'Новый замер'}
              onClose={() => {
                formEditRef.current.measure = false
                setShowMeasure(false)
              }}
            />
            <form onSubmit={saveMeasurement} className="grid" style={{ gap: 10 }}>
              <div className="field">
                <label className="label">Дата</label>
                <input className="input" type="date" required value={measureForm.date} onChange={(e) => setMeasureForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid grid-2" style={{ gap: 8 }}>
                {BODY_MEASURE_FIELDS.map((f) => (
                  <div
                    key={f.id}
                    className="field"
                    style={{
                      marginBottom: 0,
                      ...(f.id === 'glutes' ? { gridColumn: '1 / -1' } : null),
                    }}
                  >
                    <label className="label">{f.label}</label>
                    <input className="input" type="number" step="0.1" value={measureForm[f.id]} onChange={(e) => setMeasureForm((x) => ({ ...x, [f.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button type="submit" className="btn btn-primary">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <AppToast toast={toast} />
    </div>
  )
}
