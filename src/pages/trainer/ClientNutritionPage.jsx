import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { NutritionPlanDisplay } from '../../components/trainer/NutritionPlanDisplay.jsx'
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
  nutritionSurveyFromStorage,
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

const PAGE_VIEWS = {
  ration: 'ration',
  compose: 'compose',
  history: 'history',
}

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

  const [pageView, setPageView] = useState(PAGE_VIEWS.ration)
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

  const surveyLoadedRef = useRef(false)
  const planUnsavedRef = useRef(false)
  const pageViewRef = useRef(PAGE_VIEWS.ration)

  const clubId = String(client?.club_id ?? '').trim()
  const RESULT_STEP = STEPS.length - 1

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
    const surveyFromDb = nutritionSurveyFromStorage(st.health?.nutrition_survey)
    const baselineSurvey = surveyFromDb ?? defaultNutritionSurvey()

    setHealth(st.health)
    setSavedSurvey(baselineSurvey)
    if (refreshSurvey || (pageViewRef.current === PAGE_VIEWS.compose && !surveyLoadedRef.current)) {
      setSurvey(baselineSurvey)
      surveyLoadedRef.current = true
    }
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
    setPageView(PAGE_VIEWS.ration)
    setStep(0)
  }, [client?.id])

  useEffect(() => {
    void reload({ refreshSurvey: false })
  }, [reload])

  useDebouncedStorageReload(() => reload({ refreshSurvey: false }), {
    shouldRun: (d) =>
      d?.reason === 'nutrition-products' ||
      (d?.reason !== 'exercises' && d?.reason !== 'challenge-trainings'),
  })

  pageViewRef.current = pageView
  planUnsavedRef.current = planUnsaved

  const healthReady = isNutritionHealthReady(health)
  const isComposing = pageView === PAGE_VIEWS.compose
  const rationPlan = planUnsaved && pageView === PAGE_VIEWS.ration ? draftPlan : savedPlan
  const displayPlan = isComposing ? (planUnsaved ? draftPlan : savedPlan) : rationPlan
  const planStale = isNutritionPlanStale(health, savedPlan)
  const staleMessage = nutritionPlanStaleMessage(health, savedPlan)
  const daySummary = useMemo(() => buildDayProductSummary(displayPlan), [displayPlan])
  const referentCheck = useMemo(
    () => assessTotalsAgainstReferents(displayPlan?.totals, displayPlan?.referents),
    [displayPlan],
  )
  const activeSurvey = isComposing ? survey : savedSurvey
  const goalKindLabel = NUTRITION_GOAL_OPTIONS.find((o) => o.id === activeSurvey.goalKind)?.label
  const surveyDirty = useMemo(() => JSON.stringify(survey) !== JSON.stringify(savedSurvey), [survey, savedSurvey])
  const draftAligned = useMemo(() => {
    if (!draftPlan) return false
    const surveyForMatch = isComposing ? survey : savedSurvey
    return planMatchesSurvey(draftPlan, surveyForMatch)
  }, [draftPlan, survey, savedSurvey, isComposing])
  const canSavePlan = Boolean(draftPlan && draftAligned)
  const hasPendingChanges = planUnsaved || (isComposing && surveyDirty)
  const stepId = STEPS[step]?.id

  const resetDraftState = () => {
    planUnsavedRef.current = false
    setDraftPlan(null)
    setPlanUnsaved(false)
    setSurvey({ ...savedSurvey })
    setError(null)
  }

  const startCompose = ({ useSavedAnswers = false } = {}) => {
    if (readOnly || !healthReady) return
    const initial =
      useSavedAnswers && savedPlan ? { ...savedSurvey } : defaultNutritionSurvey()
    setSurvey(initial)
    surveyLoadedRef.current = true
    setDraftPlan(null)
    setPlanUnsaved(false)
    planUnsavedRef.current = false
    setPageView(PAGE_VIEWS.compose)
    setStep(0)
    setError(null)
  }

  const leaveCompose = async () => {
    if (!hasPendingChanges) {
      setPageView(PAGE_VIEWS.ration)
      setStep(0)
      return true
    }
    const msg = savedPlan
      ? 'Прервать составление и вернуть сохранённый рацион?'
      : 'Прервать составление? Несохранённые ответы будут потеряны.'
    if (!window.confirm(msg)) return false
    resetDraftState()
    setPageView(PAGE_VIEWS.ration)
    setStep(0)
    return true
  }

  const switchPageView = async (next) => {
    if (next === pageView) return
    if (pageView === PAGE_VIEWS.compose) {
      const ok = await leaveCompose()
      if (!ok) return
    } else if (hasPendingChanges && pageView === PAGE_VIEWS.ration) {
      const msg = 'Отменить черновик правок рациона?'
      if (!window.confirm(msg)) return
      resetDraftState()
    }
    setPageView(next)
    setStep(0)
  }

  const goToStep = (i) => {
    if (!healthReady || readOnly || !isComposing) return
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
      setStep(RESULT_STEP)
    } catch (e) {
      setError(e?.message ?? 'Ошибка расчёта')
    } finally {
      setBusy(false)
    }
  }

  /** Пересборка по сохранённым ответам без прохода всех шагов. */
  const rebuildFromSaved = async () => {
    if (readOnly || !client?.id) return
    if (hasPendingChanges) {
      if (!window.confirm('Отменить текущий черновик и пересобрать рацион?')) return
      resetDraftState()
    }
    const baseSurvey = { ...savedSurvey }
    setSurvey(baseSurvey)
    surveyLoadedRef.current = true
    setPageView(PAGE_VIEWS.compose)
    setBusy(true)
    setError(null)
    try {
      const result = await previewNutritionPlan(health, baseSurvey, clubId)
      if (!result.ok) {
        setError(result.errors.join('\n'))
        setStep(0)
        return
      }
      setDraftPlan(result.plan)
      setPlanUnsaved(true)
      setStep(RESULT_STEP)
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
      if (opts.goHome) {
        setPageView(PAGE_VIEWS.ration)
        setStep(0)
      } else if (opts.goToStep != null) {
        setStep(opts.goToStep)
      } else if (pageViewRef.current === PAGE_VIEWS.compose) {
        setStep(st?.plan ? RESULT_STEP : 0)
      }
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
    setPageView(PAGE_VIEWS.ration)
  }

  const persistPlan = async () => {
    if (readOnly || !client?.id || !draftPlan) return
    const surveyForSave = isComposing ? survey : savedSurvey
    if (!planMatchesSurvey(draftPlan, surveyForSave)) {
      setError('Ответы изменились — пересоберите рацион перед сохранением')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const planToSave = attachSurveyKeyToPlan(draftPlan, surveyForSave)
      await saveNutritionPlan(client.id, health, surveyForSave, planToSave)
      setSavedPlan(planToSave)
      setSavedSurvey({ ...surveyForSave })
      setDraftPlan(null)
      setPlanUnsaved(false)
      planUnsavedRef.current = false
      setPageView(PAGE_VIEWS.ration)
      setStep(0)
      await reload({ refreshSurvey: true })
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения рациона')
    } finally {
      setBusy(false)
    }
  }

  const exportPng = async () => {
    const plan = displayPlan ?? savedPlan
    if (!plan) return
    setExportBusy(true)
    try {
      const blob = await renderNutritionPlanPng(plan, { clientName: client?.name })
      const shared = await shareNutritionPlanBlob(blob, 'Рацион FIT-CITY')
      if (!shared) downloadNutritionPlanBlob(blob, `racion-${client?.id ?? 'client'}.png`)
    } catch (e) {
      alert(e?.message ?? 'Не удалось создать изображение')
    } finally {
      setExportBusy(false)
    }
  }

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
      resetDraftState()
    }
    if (!savedPlan && !health?.nutrition_plan) return
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
      surveyLoadedRef.current = false
      setPageView(PAGE_VIEWS.ration)
      setStep(0)
      await reload({ refreshSurvey: false })
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

      {planStale && staleMessage && pageView === PAGE_VIEWS.ration ? (
        <section className="card nutrition-stale-banner" role="status">
          <p style={{ margin: 0 }}>{staleMessage}</p>
          {!readOnly ? (
            <button
              type="button"
              className="btn btn-touch"
              style={{ marginTop: 10 }}
              disabled={busy}
              onClick={() => void rebuildFromSaved()}
            >
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

      {healthReady && !isComposing ? (
        <div className="nutrition-main-tabs" role="tablist" aria-label="Разделы питания">
          <button
            type="button"
            role="tab"
            aria-selected={pageView === PAGE_VIEWS.ration}
            className={`nutrition-main-tabs__item${pageView === PAGE_VIEWS.ration ? ' nutrition-main-tabs__item--active' : ''}`}
            onClick={() => void switchPageView(PAGE_VIEWS.ration)}
          >
            Текущий рацион
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageView === PAGE_VIEWS.history}
            className={`nutrition-main-tabs__item${pageView === PAGE_VIEWS.history ? ' nutrition-main-tabs__item--active' : ''}`}
            onClick={() => void switchPageView(PAGE_VIEWS.history)}
          >
            Предыдущие рационы
            {planHistory.length > 0 ? ` (${planHistory.length})` : ''}
          </button>
        </div>
      ) : null}

      {healthReady && isComposing ? (
        <div className="nutrition-compose-header">
          <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={() => void leaveCompose()}>
            <ChevronLeft size={18} aria-hidden />
            К рациону
          </button>
          <span className="nutrition-compose-header__title">Составление рациона</span>
        </div>
      ) : null}

      {error ? (
        <p className="nutrition-error" role="alert">
          {error}
        </p>
      ) : null}

      {healthReady && pageView === PAGE_VIEWS.ration && !savedPlan && !planUnsaved ? (
        <section className="card nutrition-panel nutrition-empty">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Рацион ещё не составлен
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Нажмите кнопку ниже — откроется опросник (профиль, приёмы пищи, продукты). Ответы сохранятся только после «Сохранить рацион».
          </p>
          {!readOnly ? (
            <button type="button" className="btn btn-touch" style={{ marginTop: 12 }} disabled={busy} onClick={() => startCompose()}>
              Начать составление рациона
            </button>
          ) : null}
        </section>
      ) : null}

      {healthReady && pageView === PAGE_VIEWS.ration && (savedPlan || (planUnsaved && draftPlan)) ? (
        <section className="card nutrition-panel">
          <NutritionPlanDisplay
            client={client}
            health={health}
            displayPlan={displayPlan}
            planUnsaved={planUnsaved}
            generatedAt={generatedAt}
            goalKindLabel={goalKindLabel}
            referentCheck={referentCheck}
            daySummary={daySummary}
            readOnly={readOnly}
            exportBusy={exportBusy}
            onExport={exportPng}
            onItemGramsChange={onItemGramsChange}
            hasPendingChanges={hasPendingChanges && pageView === PAGE_VIEWS.ration}
            draftAligned={draftAligned}
            onDiscard={() => discardDraft({ goHome: true })}
            busy={busy}
            formatDateRu={formatDateRu}
          />
        </section>
      ) : null}

      {healthReady && pageView === PAGE_VIEWS.history ? (
        <section className="card nutrition-panel">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
            Предыдущие рационы
          </h2>
          {planHistory.length === 0 ? (
            <p className="muted" style={{ marginTop: 0 }}>
              Пока нет сохранённых версий. При каждом новом сохранении рациона старая версия попадает сюда.
            </p>
          ) : (
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
          )}
        </section>
      ) : null}

      {healthReady && isComposing ? (
        <>
          <div className="nutrition-stepper" role="tablist" aria-label="Шаги рациона">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`nutrition-stepper__item${i === step ? ' nutrition-stepper__item--active' : ''}${i < step ? ' nutrition-stepper__item--done' : ''}`}
                onClick={() => goToStep(i)}
                disabled={readOnly}
              >
                {s.label}
              </button>
            ))}
          </div>

          {stepId === 'profile' && (
            <section className="card nutrition-panel">
              <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
                Профиль для расчёта
              </h2>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Пол берётся из карты здоровья. <Link to={healthTabHref}>Изменить в «Здоровье»</Link>
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

          {stepId === 'result' && displayPlan ? (
            <section className="card nutrition-panel">
              <NutritionPlanDisplay
                client={client}
                health={health}
                displayPlan={displayPlan}
                planUnsaved={planUnsaved}
                generatedAt={generatedAt}
                goalKindLabel={goalKindLabel}
                referentCheck={referentCheck}
                daySummary={daySummary}
                readOnly={readOnly}
                exportBusy={exportBusy}
                onExport={exportPng}
                onItemGramsChange={onItemGramsChange}
                hasPendingChanges={hasPendingChanges}
                draftAligned={draftAligned}
                onDiscard={() => discardDraft()}
                busy={busy}
                formatDateRu={formatDateRu}
              />
            </section>
          ) : null}

          {stepId === 'result' && !displayPlan ? (
            <section className="card nutrition-panel">
              <p className="muted">Рацион ещё не собран. Вернитесь к шагам и нажмите «Собрать рацион».</p>
            </section>
          ) : null}
        </>
      ) : null}

      {healthReady && isComposing && stepId !== 'result' ? (
        <div className="nutrition-nav">
          <button type="button" className="btn btn-touch btn-ghost" disabled={step === 0 || busy} onClick={goPrev}>
            <ChevronLeft size={18} aria-hidden />
            Назад
          </button>
          <button type="button" className="btn btn-touch" disabled={readOnly || busy} onClick={() => void goNext()}>
            {step === STEPS.length - 2 ? 'Собрать рацион' : 'Далее'}
            {step < STEPS.length - 2 ? <ChevronRight size={18} aria-hidden /> : null}
          </button>
        </div>
      ) : null}

      {healthReady && isComposing && stepId === 'result' && !readOnly ? (
        <div className="nutrition-nav">
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
            <button type="button" className="btn btn-touch" disabled={busy} onClick={() => void buildPlan()}>
              Пересобрать рацион
            </button>
          )}
        </div>
      ) : null}

      {healthReady && isComposing && stepId !== 'result' && hasPendingChanges && !readOnly ? (
        <div className="nutrition-nav nutrition-nav--cancel">
          <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={() => void discardDraft()}>
            Отменить составление
          </button>
        </div>
      ) : null}

      {healthReady && pageView === PAGE_VIEWS.ration && !readOnly && (savedPlan || planUnsaved) ? (
        <div className="nutrition-nav">
          {!hasPendingChanges && savedPlan ? (
            <>
              <button
                type="button"
                className="btn btn-touch btn-ghost nutrition-nav__delete"
                disabled={busy}
                onClick={() => void deleteSavedNutrition()}
              >
                Удалить
              </button>
              <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={() => startCompose({ useSavedAnswers: true })}>
                Изменить ответы
              </button>
              <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={beginPlanEdit}>
                Редактировать граммы
              </button>
              <button type="button" className="btn btn-touch" disabled={busy} onClick={() => void rebuildFromSaved()}>
                Пересобрать рацион
              </button>
            </>
          ) : hasPendingChanges ? (
            <>
              <button type="button" className="btn btn-touch btn-ghost" disabled={busy} onClick={() => void discardDraft({ goHome: true })}>
                Отменить
              </button>
              {planUnsaved && draftAligned ? (
                <button type="button" className="btn btn-touch" disabled={busy} onClick={() => void persistPlan()}>
                  Сохранить рацион
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
