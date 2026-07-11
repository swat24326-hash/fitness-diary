import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Share2, X } from 'lucide-react'
import {
  NUTRITION_ACTIVITY_OPTIONS,
  NUTRITION_EXCLUSION_OPTIONS,
  NUTRITION_GOAL_OPTIONS,
  NUTRITION_MEALS_PER_DAY_OPTIONS,
} from '../../lib/nutrition/nutritionMacrosCore.js'
import {
  buildNutritionCatalogMap,
  catalogSourceLabel,
  listCatalogProductsByGroup,
} from '../../lib/nutrition/nutritionCatalogResolve.js'
import { isNutritionHealthReady } from '../../lib/nutrition/nutritionPlanBuilder.js'
import { getHealthCurrentWeightKg } from '../../lib/clientWeightCore'
import { getHealthSex } from '../../lib/healthCardCore'
import { isNutritionPlanStale, nutritionPlanStaleMessage } from '../../lib/nutrition/nutritionPlanStaleCore.js'
import { listNutritionProductsForClub } from '../../lib/nutrition/nutritionProductsService.js'
import { pullNutritionProductsForClubFromCloud } from '../../lib/pullReferenceData.js'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  clearSavedNutrition,
  defaultNutritionSurvey,
  loadClientNutritionState,
  previewNutritionPlan,
  removeNutritionHistoryEntry,
  saveNutritionPlan,
  toggleProductId,
} from '../../lib/nutrition/nutritionPlanService.js'
import { assessTotalsAgainstReferents } from '../../lib/nutrition/nutritionReferentsCore.js'
import { attachSurveyKeyToPlan, planMatchesSurvey } from '../../lib/nutrition/nutritionPlanSessionCore.js'
import {
  downloadNutritionPlanBlob,
  renderNutritionPlanPng,
  shareNutritionPlanBlob,
} from '../../lib/nutrition/nutritionPlanExportCanvas.js'
import { buildDayProductSummary, setPlanItemGrams } from '../../lib/nutrition/nutritionPlanEditCore.js'
import { formatDateRu } from '../../lib/dateRu'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'

const STEPS = [
  { id: 'profile', label: 'Профиль' },
  { id: 'meals', label: 'Приёмы' },
  { id: 'exclusions', label: 'Ограничения' },
  { id: 'protein', label: 'Белки' },
  { id: 'fat', label: 'Жиры' },
  { id: 'carbs', label: 'Углеводы' },
  { id: 'result', label: 'Рацион' },
]

function ProductChips({ group, selected, exclusions, catalogMap, onToggle, readOnly }) {
  const products = useMemo(() => listCatalogProductsByGroup(catalogMap, group), [catalogMap, group])
  const ex = new Set(exclusions ?? [])
  return (
    <div className="nutrition-chips">
      {products.map((p) => {
        const blocked = p.tags?.some((t) => ex.has(t))
        const active = selected.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            className={`nutrition-chip${active ? ' nutrition-chip--active' : ''}${blocked ? ' nutrition-chip--blocked' : ''}`}
            disabled={readOnly || blocked}
            title={blocked ? 'Исключено ограничениями' : undefined}
            onClick={() => onToggle(p.id)}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

export function ClientNutritionPage({ client, readOnly = false }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const healthTabHref = useMemo(() => {
    const sp = new URLSearchParams(searchParams)
    sp.set('tab', 'health')
    const qs = sp.toString()
    return `${location.pathname}${qs ? `?${qs}` : ''}`
  }, [location.pathname, searchParams])
  const [step, setStep] = useState(0)
  const [health, setHealth] = useState(null)
  const [survey, setSurvey] = useState(() => defaultNutritionSurvey())
  const [savedSurvey, setSavedSurvey] = useState(() => defaultNutritionSurvey())
  const [savedPlan, setSavedPlan] = useState(null)
  const [draftPlan, setDraftPlan] = useState(null)
  const [planUnsaved, setPlanUnsaved] = useState(false)
  const [planHistory, setPlanHistory] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [catalogMap, setCatalogMap] = useState(() => buildNutritionCatalogMap([]))
  const [catalogLabel, setCatalogLabel] = useState('Базовый справочник')
  /** Опросник не перезаписывать из IDB после первой загрузки — иначе sync сбрасывает ввод. */
  const surveyLoadedRef = useRef(false)
  const planUnsavedRef = useRef(false)

  const clubId = String(client?.club_id ?? '').trim()

  const reloadCatalog = useCallback(async () => {
    if (!clubId) {
      const map = buildNutritionCatalogMap([])
      setCatalogMap(map)
      setCatalogLabel(catalogSourceLabel(map))
      return
    }
    if (isSupabaseConfigured() && navigator.onLine) {
      await pullNutritionProductsForClubFromCloud(clubId)
    }
    const rows = await listNutritionProductsForClub(clubId, { activeOnly: true })
    const map = buildNutritionCatalogMap(rows)
    setCatalogMap(map)
    setCatalogLabel(catalogSourceLabel(map))
  }, [clubId])

  const reload = useCallback(async ({ refreshSurvey = false } = {}) => {
    if (!client?.id) return null
    await reloadCatalog()
    const st = await loadClientNutritionState(client.id)
    const normalizedSurvey = { ...defaultNutritionSurvey(), ...st.survey }
    setHealth(st.health)
    if (refreshSurvey || !surveyLoadedRef.current) {
      setSurvey(normalizedSurvey)
      surveyLoadedRef.current = true
    }
    setSavedSurvey(normalizedSurvey)
    setSavedPlan(st.plan)
    if (!planUnsavedRef.current) {
      setDraftPlan(null)
      setPlanUnsaved(false)
    }
    setPlanHistory(st.planHistory ?? [])
    setGeneratedAt(st.generatedAt)
    return st
  }, [client?.id, reloadCatalog])

  useEffect(() => {
    surveyLoadedRef.current = false
  }, [client?.id])

  useEffect(() => {
    void reload({ refreshSurvey: true })
  }, [reload])

  useDebouncedStorageReload(() => reload({ refreshSurvey: false }), {
    shouldRun: (d) =>
      d?.reason === 'nutrition-products' ||
      (d?.reason !== 'exercises' && d?.reason !== 'challenge-trainings'),
  })
  const healthReady = isNutritionHealthReady(health)
  const displayPlan = planUnsaved ? draftPlan : savedPlan
  const planStale = isNutritionPlanStale(health, savedPlan)
  const staleMessage = nutritionPlanStaleMessage(health, savedPlan)
  const daySummary = useMemo(() => buildDayProductSummary(displayPlan), [displayPlan])
  const referentCheck = useMemo(
    () => assessTotalsAgainstReferents(displayPlan?.totals, displayPlan?.referents),
    [displayPlan],
  )
  const goalKindLabel = NUTRITION_GOAL_OPTIONS.find((o) => o.id === survey.goalKind)?.label
  const surveyDirty = useMemo(() => JSON.stringify(survey) !== JSON.stringify(savedSurvey), [survey, savedSurvey])
  const draftAligned = useMemo(
    () => (draftPlan ? planMatchesSurvey(draftPlan, survey) : false),
    [draftPlan, survey],
  )
  const canSavePlan = Boolean(draftPlan && draftAligned)
  const hasPendingChanges = planUnsaved || surveyDirty
  planUnsavedRef.current = planUnsaved

  const RESULT_STEP = STEPS.length - 1

  const resetToSavedBaseline = () => {
    planUnsavedRef.current = false
    setDraftPlan(null)
    setPlanUnsaved(false)
    setSurvey({ ...savedSurvey })
    setError(null)
  }

  const goToStep = (i) => {
    if (!healthReady || readOnly) return
    if (step === RESULT_STEP && i < RESULT_STEP && hasPendingChanges) {
      resetToSavedBaseline()
    }
    setStep(i)
  }

  const patchSurvey = (patch) => setSurvey((s) => ({ ...s, ...patch }))

  const onItemGramsChange = (mealSlot, productId, raw) => {
    const grams = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(grams) || grams <= 0) return
    const base = draftPlan ?? savedPlan
    if (!base) return
    const next = setPlanItemGrams(base, catalogMap, mealSlot, productId, grams)
    setDraftPlan(next)
    setPlanUnsaved(true)
    setError(null)
  }

  const buildPlan = async () => {
    if (readOnly || !client?.id) return
    setBusy(true)
    setError(null)
    try {
      const result = await previewNutritionPlan(health, survey, clubId)
      if (!result.ok) {
        setError(result.errors.join('\n'))
        return
      }
      setDraftPlan(result.plan)
      setPlanUnsaved(true)
      setStep(STEPS.length - 1)
    } catch (e) {
      setError(e?.message ?? 'Ошибка расчёта')
    } finally {
      setBusy(false)
    }
  }

  const discardDraft = async (opts = {}) => {
    if (readOnly || !client?.id || !hasPendingChanges) return false
    const msg = savedPlan
      ? 'Удалить черновик и вернуть сохранённый рацион с прежними ответами?'
      : 'Отменить составление и вернуть прежние ответы?'
    if (!window.confirm(msg)) return false
    setBusy(true)
    setError(null)
    planUnsavedRef.current = false
    try {
      setDraftPlan(null)
      setPlanUnsaved(false)
      surveyLoadedRef.current = false
      const st = await reload({ refreshSurvey: true })
      if (opts.goToStep != null) setStep(opts.goToStep)
      else setStep(st?.plan ? STEPS.length - 1 : 0)
      return true
    } catch (e) {
      setError(e?.message ?? 'Не удалось отменить черновик')
      return false
    } finally {
      setBusy(false)
    }
  }

  const beginPlanEdit = () => {
    if (!savedPlan) return
    const copy = JSON.parse(JSON.stringify(savedPlan))
    setDraftPlan(attachSurveyKeyToPlan(copy, savedSurvey))
    setPlanUnsaved(true)
  }

  const persistPlan = async () => {
    if (readOnly || !client?.id || !draftPlan) return
    if (!planMatchesSurvey(draftPlan, survey)) {
      setError('Ответы изменились — пересоберите рацион перед сохранением')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const planToSave = attachSurveyKeyToPlan(draftPlan, survey)
      await saveNutritionPlan(client.id, health, survey, planToSave)
      setSavedPlan(planToSave)
      setDraftPlan(null)
      setPlanUnsaved(false)
      await reload({ refreshSurvey: false })
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения рациона')
    } finally {
      setBusy(false)
    }
  }

  const exportPng = async () => {
    if (!displayPlan) return
    setExportBusy(true)
    try {
      const blob = await renderNutritionPlanPng(displayPlan, { clientName: client?.name })
      const shared = await shareNutritionPlanBlob(blob, 'Рацион FIT-CITY')
      if (!shared) downloadNutritionPlanBlob(blob, `racion-${client?.id ?? 'client'}.png`)
    } catch (e) {
      alert(e?.message ?? 'Не удалось создать изображение')
    } finally {
      setExportBusy(false)
    }
  }

  const stepId = STEPS[step]?.id

  const goNext = async () => {
    if (step < STEPS.length - 2) {
      setStep((s) => s + 1)
      return
    }
    if (step === STEPS.length - 2) {
      await buildPlan()
    }
  }

  const goPrev = () => {
    setStep((s) => Math.max(0, s - 1))
  }

  const deleteSavedNutrition = async () => {
    if (readOnly || !client?.id) return
    if (hasPendingChanges) {
      const discardFirst = window.confirm('Сначала отменить несохранённый черновик?')
      if (!discardFirst) return
      resetToSavedBaseline()
    }
    if (!savedPlan && !health?.nutrition_plan) {
      setStep(0)
      return
    }
    if (
      !window.confirm(
        'Удалить сохранённый рацион и ответы опросника? Записи в истории останутся — их можно удалить отдельно.',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    planUnsavedRef.current = false
    try {
      await clearSavedNutrition(client.id, health)
      setSavedPlan(null)
      setDraftPlan(null)
      setPlanUnsaved(false)
      setSurvey(defaultNutritionSurvey())
      setSavedSurvey(defaultNutritionSurvey())
      surveyLoadedRef.current = true
      setStep(0)
      await reload({ refreshSurvey: true })
    } catch (e) {
      setError(e?.message ?? 'Не удалось удалить рацион')
    } finally {
      setBusy(false)
    }
  }

  const deleteHistoryEntry = async (generatedAt) => {
    if (readOnly || !client?.id || !generatedAt) return
    if (!window.confirm('Удалить эту запись из истории?')) return
    setBusy(true)
    setError(null)
    try {
      await removeNutritionHistoryEntry(client.id, health, generatedAt)
      await reload({ refreshSurvey: false })
    } catch (e) {
      setError(e?.message ?? 'Не удалось удалить запись')
    } finally {
      setBusy(false)
    }
  }

  if (!client) return null

  return (
    <div className="nutrition-page">
      <p className="nutrition-disclaimer muted">
        Ориентировочный рацион для клиента, не медицинское назначение. Справочник: <strong>{catalogLabel}</strong>.
      </p>

      {planStale && staleMessage ? (
        <section className="card nutrition-stale-banner" role="status">
          <p style={{ margin: 0 }}>{staleMessage}</p>
          {!readOnly ? (
            <button type="button" className="btn btn-touch" style={{ marginTop: 10 }} disabled={busy} onClick={() => void buildPlan()}>
              Пересобрать рацион
            </button>
          ) : null}
        </section>
      ) : null}

      {!healthReady ? (
        <section className="card nutrition-health-banner">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Сначала заполните карту здоровья
          </h2>
          <p className="muted">
            Во вкладке «Здоровье» укажите дату карты, пол, рост и исходный вес — они нужны для расчёта рациона и первой тренировки.
          </p>
          <Link to={healthTabHref} className="btn btn-touch" style={{ marginTop: 12 }}>
            Перейти в Здоровье
          </Link>
        </section>
      ) : (
        <section className="card nutrition-health-preview">
          <p className="muted" style={{ margin: 0 }}>
            Из «Здоровья»: пол <strong>{getHealthSex(health) === 'male' ? 'мужской' : 'женский'}</strong>, рост{' '}
            <strong>{health.height_cm}</strong> см, текущий вес <strong>{getHealthCurrentWeightKg(health) ?? '—'}</strong> кг
            {health.goal ? (
              <>
                , цель: <strong>{health.goal}</strong>
              </>
            ) : null}
          </p>
        </section>
      )}

      <div className="nutrition-stepper" role="tablist" aria-label="Шаги рациона">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`nutrition-stepper__item${i === step ? ' nutrition-stepper__item--active' : ''}${i < step ? ' nutrition-stepper__item--done' : ''}`}
            onClick={() => goToStep(i)}
            disabled={!healthReady || readOnly}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="nutrition-error" role="alert">
          {error}
        </p>
      ) : null}

      {stepId === 'profile' && (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Профиль для расчёта
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Пол берётся из карты здоровья.{' '}
            <Link to={healthTabHref}>Изменить в «Здоровье»</Link>
          </p>
          <div className="nutrition-form-grid">
            <label className="nutrition-field">
              <span>Возраст</span>
              <input
                className="input"
                type="number"
                min={14}
                max={90}
                value={survey.age ?? ''}
                disabled={readOnly}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    patchSurvey({ age: undefined })
                    return
                  }
                  const n = Number(raw)
                  patchSurvey({ age: Number.isFinite(n) ? n : undefined })
                }}
              />
            </label>
          </div>
          <p className="nutrition-field-label">Цель питания</p>
          <div className="nutrition-chips">
            {NUTRITION_GOAL_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`nutrition-chip${survey.goalKind === o.id ? ' nutrition-chip--active' : ''}`}
                disabled={readOnly}
                onClick={() => patchSurvey({ goalKind: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="nutrition-field-label">Двигательная активность</p>
          <div className="nutrition-chips nutrition-chips--stack">
            {NUTRITION_ACTIVITY_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`nutrition-chip nutrition-chip--wide${survey.activityLevel === o.id ? ' nutrition-chip--active' : ''}`}
                disabled={readOnly}
                onClick={() => patchSurvey({ activityLevel: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {stepId === 'meals' && (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Сколько приёмов пищи в день?
          </h2>
          <div className="nutrition-chips">
            {NUTRITION_MEALS_PER_DAY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`nutrition-chip nutrition-chip--meal${survey.mealsPerDay === n ? ' nutrition-chip--active' : ''}`}
                disabled={readOnly}
                onClick={() => patchSurvey({ mealsPerDay: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="muted nutrition-hint">
            {survey.mealsPerDay === 3 && 'Завтрак · обед · ужин'}
            {survey.mealsPerDay === 4 && 'Завтрак · перекус · обед · ужин'}
            {survey.mealsPerDay === 5 && 'Завтрак · перекус · обед · полдник · ужин'}
            {survey.mealsPerDay === 6 && 'Завтрак · 2 перекуса · обед · ужин · вечерний перекус'}
          </p>
        </section>
      )}

      {stepId === 'exclusions' && (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Ограничения
          </h2>
          <div className="nutrition-chips">
            {NUTRITION_EXCLUSION_OPTIONS.map((o) => {
              const on = (survey.exclusions ?? []).includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`nutrition-chip${on ? ' nutrition-chip--active' : ''}`}
                  disabled={readOnly}
                  onClick={() =>
                    patchSurvey({
                      exclusions: toggleProductId(survey.exclusions, o.id),
                    })
                  }
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {stepId === 'protein' && (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Белки — что клиент готов есть
          </h2>
          <ProductChips
            group="protein"
            selected={survey.pickedProducts?.protein ?? []}
            exclusions={survey.exclusions}
            catalogMap={catalogMap}
            readOnly={readOnly}
            onToggle={(id) =>
              patchSurvey({
                pickedProducts: {
                  ...survey.pickedProducts,
                  protein: toggleProductId(survey.pickedProducts?.protein, id),
                },
              })
            }
          />
        </section>
      )}

      {stepId === 'fat' && (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Жиры
          </h2>
          <ProductChips
            group="fat"
            selected={survey.pickedProducts?.fat ?? []}
            exclusions={survey.exclusions}
            catalogMap={catalogMap}
            readOnly={readOnly}
            onToggle={(id) =>
              patchSurvey({
                pickedProducts: {
                  ...survey.pickedProducts,
                  fat: toggleProductId(survey.pickedProducts?.fat, id),
                },
              })
            }
          />
        </section>
      )}

      {stepId === 'carbs' && (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Углеводы
          </h2>
          <ProductChips
            group="carbs"
            selected={survey.pickedProducts?.carbs ?? []}
            exclusions={survey.exclusions}
            catalogMap={catalogMap}
            readOnly={readOnly}
            onToggle={(id) =>
              patchSurvey({
                pickedProducts: {
                  ...survey.pickedProducts,
                  carbs: toggleProductId(survey.pickedProducts?.carbs, id),
                },
              })
            }
          />
        </section>
      )}

      {stepId === 'result' && displayPlan && (
        <section className="card nutrition-panel">
          <div className="nutrition-result-header">
            <div className="nutrition-result-header__main">
              <h2 className="section-title nutrition-client-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                {client.name}
              </h2>
              <p className="nutrition-client-meta muted" style={{ margin: '6px 0 0' }}>
                Вес <strong>{getHealthCurrentWeightKg(health) ?? '—'}</strong> кг
                {health?.goal ? (
                  <>
                    {' '}
                    · Цель: <strong>{health.goal}</strong>
                  </>
                ) : null}
                {goalKindLabel ? (
                  <>
                    {' '}
                    · Питание: <strong>{goalKindLabel}</strong>
                  </>
                ) : null}
                {generatedAt && !planUnsaved ? ` · сохранён ${formatDateRu(generatedAt.slice(0, 10))}` : null}
              </p>
              {displayPlan.referents ? (
                <p className="nutrition-referents" style={{ margin: '8px 0 0', fontSize: 13 }}>
                  Референты: ккал <strong>{displayPlan.referents.kcal.min}–{displayPlan.referents.kcal.max}</strong>
                  {' '}(цель ~{displayPlan.referents.kcal.aim}) · Б{' '}
                  <strong>{displayPlan.referents.protein.min}–{displayPlan.referents.protein.max}</strong> г · Ж{' '}
                  <strong>{displayPlan.referents.fat.min}–{displayPlan.referents.fat.max}</strong> г · У{' '}
                  <strong>{displayPlan.referents.carbs.min}–{displayPlan.referents.carbs.max}</strong> г
                </p>
              ) : null}
              <p className="nutrition-fact-line" style={{ margin: '8px 0 0' }}>
                Факт: <strong>{displayPlan.totals?.kcal ?? '—'}</strong> ккал · Б {displayPlan.totals?.proteinG} · Ж{' '}
                {displayPlan.totals?.fatG} · У {displayPlan.totals?.carbsG}
                {referentCheck ? (
                  <span className="nutrition-referent-status">
                    {' '}
                    · в референтах: ккал {referentCheck.kcal ? '✓' : '—'} · Б {referentCheck.protein ? '✓' : '—'} · Ж{' '}
                    {referentCheck.fat ? '✓' : '—'} · У {referentCheck.carbs ? '✓' : '—'}
                  </span>
                ) : null}
              </p>
              {hasPendingChanges ? (
                <p className="nutrition-unsaved-banner" role="status">
                  {planUnsaved && !draftAligned
                    ? 'Ответы изменились — пересоберите рацион, иначе сохранение недоступно.'
                    : planUnsaved
                      ? 'Черновик рациона — сохраните или отмените.'
                      : 'Ответы изменены — пересоберите рацион или отмените.'}
                  {!readOnly ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost nutrition-unsaved-banner__btn"
                      disabled={busy}
                      onClick={() => void discardDraft()}
                    >
                      Отменить
                    </button>
                  ) : null}
                </p>
              ) : null}
              {!readOnly && planUnsaved ? (
                <p className="muted nutrition-edit-hint" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Можно подправить граммы — изменения попадут в черновик до сохранения.
                </p>
              ) : null}
            </div>
            <div className="nutrition-result-actions">
              <button type="button" className="btn btn-touch" disabled={exportBusy || planUnsaved} onClick={() => void exportPng()}>
                <Share2 size={18} aria-hidden />
                Поделиться / PNG
              </button>
              <button type="button" className="btn btn-touch btn-ghost" disabled={exportBusy || planUnsaved} onClick={() => void exportPng()}>
                <Download size={18} aria-hidden />
                Скачать
              </button>
            </div>
          </div>

          {daySummary.length > 0 ? (
            <article className="nutrition-meal-block nutrition-day-summary">
              <h3 className="nutrition-meal-title">Сводка на день</h3>
              <table className="nutrition-table">
                <thead>
                  <tr>
                    <th>Продукт</th>
                    <th>Всего</th>
                    <th>ккал</th>
                    <th>Б</th>
                    <th>Ж</th>
                    <th>У</th>
                  </tr>
                </thead>
                <tbody>
                  {daySummary.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.label}</td>
                      <td>{row.portionLabel}</td>
                      <td>{row.kcal}</td>
                      <td>{row.proteinG}</td>
                      <td>{row.fatG}</td>
                      <td>{row.carbsG}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ) : null}

          <div className="nutrition-day-table">
            {displayPlan.dayPlan.map((meal) => (
              <article key={meal.slot} className="nutrition-meal-block">
                <h3 className="nutrition-meal-title">{meal.label}</h3>
                <table className="nutrition-table">
                  <thead>
                    <tr>
                      <th>Продукт</th>
                      <th>Порция</th>
                      <th>ккал</th>
                      <th>Б</th>
                      <th>Ж</th>
                      <th>У</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meal.items.map((item) => (
                      <tr key={`${meal.slot}-${item.productId}`}>
                        <td>{item.label}</td>
                        <td>
                          {readOnly || !planUnsaved ? (
                            item.portionLabel
                          ) : (
                            <label className="nutrition-grams-edit">
                              <input
                                className="input nutrition-grams-input"
                                type="number"
                                min={5}
                                step={5}
                                inputMode="decimal"
                                defaultValue={item.grams ?? ''}
                                key={`${meal.slot}-${item.productId}-${item.grams}`}
                                onBlur={(e) => onItemGramsChange(meal.slot, item.productId, e.target.value)}
                              />
                              <span className="muted">г</span>
                            </label>
                          )}
                        </td>
                        <td>{item.kcal}</td>
                        <td>{item.proteinG}</td>
                        <td>{item.fatG}</td>
                        <td>{item.carbsG}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        <strong>Подытог</strong>
                      </td>
                      <td>{meal.subtotal.kcal}</td>
                      <td>{meal.subtotal.proteinG}</td>
                      <td>{meal.subtotal.fatG}</td>
                      <td>{meal.subtotal.carbsG}</td>
                    </tr>
                  </tfoot>
                </table>
              </article>
            ))}
          </div>

          <p className="nutrition-totals">
            <strong>Итого за день:</strong> {displayPlan.totals.kcal} ккал (референт ~{displayPlan.kcalTarget}) · Б{' '}
            {displayPlan.totals.proteinG} · Ж {displayPlan.totals.fatG} · У {displayPlan.totals.carbsG}
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            {displayPlan.disclaimer}
          </p>

          {planHistory.length > 0 && !planUnsaved ? (
            <section className="nutrition-plan-history-block">
              <h3 className="section-title" style={{ fontSize: '0.95rem' }}>
                Предыдущие рационы
              </h3>
              <ul className="nutrition-plan-history">
                {planHistory.map((h) => (
                  <li key={h.generated_at} className="nutrition-plan-history__row">
                    <span className="nutrition-plan-history__text">
                      <span className="muted">{formatDateRu(String(h.generated_at).slice(0, 10))}</span>
                      {' — '}
                      <strong>{h.kcal ?? h.kcalTarget ?? '—'} ккал</strong>
                      {h.proteinG != null ? ` · Б ${h.proteinG}` : ''}
                      {h.fatG != null ? ` · Ж ${h.fatG}` : ''}
                      {h.carbsG != null ? ` · У ${h.carbsG}` : ''}
                      {h.mealsPerDay ? ` · ${h.mealsPerDay} приёма` : ''}
                    </span>
                    {!readOnly ? (
                      <button
                        type="button"
                        className="btn-icon-square nutrition-plan-history__delete"
                        aria-label="Удалить запись из истории"
                        disabled={busy}
                        onClick={() => void deleteHistoryEntry(h.generated_at)}
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      )}

      {stepId === 'result' && !displayPlan && (
        <section className="card nutrition-panel">
          <p className="muted">Рацион ещё не собран. Вернитесь к шагам и нажмите «Собрать рацион».</p>
        </section>
      )}

      {healthReady && stepId !== 'result' && (
        <div className="nutrition-nav">
          <button type="button" className="btn btn-touch btn-ghost" disabled={step === 0 || busy} onClick={goPrev}>
            <ChevronLeft size={18} aria-hidden />
            Назад
          </button>
          <button
            type="button"
            className="btn btn-touch"
            disabled={readOnly || busy}
            onClick={() => void goNext()}
          >
            {step === STEPS.length - 2 ? 'Собрать рацион' : 'Далее'}
            {step < STEPS.length - 2 ? <ChevronRight size={18} aria-hidden /> : null}
          </button>
        </div>
      )}

      {healthReady && stepId === 'result' && !readOnly && (
        <div className="nutrition-nav">
          {!hasPendingChanges && (savedPlan || health?.nutrition_plan) ? (
            <button
              type="button"
              className="btn btn-touch btn-ghost nutrition-nav__delete"
              disabled={busy}
              onClick={() => void deleteSavedNutrition()}
            >
              Удалить
            </button>
          ) : null}
          {hasPendingChanges ? (
            <>
              <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={() => void discardDraft()}>
                Отменить
              </button>
              <button type="button" className="btn btn-touch" disabled={busy || !canSavePlan} onClick={() => void persistPlan()}>
                Сохранить рацион
              </button>
            </>
          ) : (
            <>
              {savedPlan ? (
                <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={beginPlanEdit}>
                  Редактировать граммы
                </button>
              ) : null}
              <button type="button" className="btn btn-touch" disabled={busy} onClick={() => void buildPlan()}>
                {savedPlan ? 'Пересобрать рацион' : 'Собрать рацион'}
              </button>
            </>
          )}
        </div>
      )}

      {healthReady && stepId !== 'result' && hasPendingChanges && !readOnly ? (
        <div className="nutrition-nav nutrition-nav--cancel">
          <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={() => void discardDraft()}>
            Отменить составление
          </button>
        </div>
      ) : null}
    </div>
  )
}
