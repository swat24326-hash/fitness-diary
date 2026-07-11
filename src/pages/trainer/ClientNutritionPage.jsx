import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Share2 } from 'lucide-react'
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
  buildAndSaveNutritionPlan,
  defaultNutritionSurvey,
  loadClientNutritionState,
  saveClientNutrition,
  toggleProductId,
} from '../../lib/nutrition/nutritionPlanService.js'
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
  const [survey, setSurvey] = useState(defaultNutritionSurvey)
  const [plan, setPlan] = useState(null)
  const [planHistory, setPlanHistory] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [catalogMap, setCatalogMap] = useState(() => buildNutritionCatalogMap([]))
  const [catalogLabel, setCatalogLabel] = useState('Базовый справочник')
  /** Опросник не перезаписывать из IDB после первой загрузки — иначе sync сбрасывает ввод. */
  const surveyLoadedRef = useRef(false)

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
    if (!client?.id) return
    await reloadCatalog()
    const st = await loadClientNutritionState(client.id)
    setHealth(st.health)
    if (refreshSurvey || !surveyLoadedRef.current) {
      setSurvey({ ...defaultNutritionSurvey(), ...st.survey })
      surveyLoadedRef.current = true
    }
    setPlan(st.plan)
    setPlanHistory(st.planHistory ?? [])
    setGeneratedAt(st.generatedAt)
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
  const planStale = isNutritionPlanStale(health, plan)
  const staleMessage = nutritionPlanStaleMessage(health, plan)
  const daySummary = useMemo(() => buildDayProductSummary(plan), [plan])
  const kcalDelta = plan?.kcalTarget != null && plan?.totals?.kcal != null ? plan.totals.kcal - plan.kcalTarget : null

  const patchSurvey = (patch) => setSurvey((s) => ({ ...s, ...patch }))

  const persistPlan = async (nextPlan) => {
    if (readOnly || !client?.id) return
    await saveClientNutrition(client.id, health, survey, nextPlan)
  }

  const onItemGramsChange = async (mealSlot, productId, raw) => {
    const grams = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(grams) || grams <= 0 || !plan) return
    const next = setPlanItemGrams(plan, catalogMap, mealSlot, productId, grams)
    setPlan(next)
    try {
      await persistPlan(next)
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения правки')
    }
  }

  const saveSurveyDraft = async () => {
    if (readOnly || !client?.id) return
    setBusy(true)
    setError(null)
    try {
      await saveClientNutrition(client.id, health, survey, plan)
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const buildPlan = async () => {
    if (readOnly || !client?.id) return
    setBusy(true)
    setError(null)
    try {
      const result = await buildAndSaveNutritionPlan(client.id, health, survey, clubId)
      if (!result.ok) {
        setError(result.errors.join('\n'))
        return
      }
      setPlan(result.plan)
      setGeneratedAt(new Date().toISOString())
      setStep(STEPS.length - 1)
      await reload({ refreshSurvey: false })
    } catch (e) {
      setError(e?.message ?? 'Ошибка расчёта')
    } finally {
      setBusy(false)
    }
  }

  const exportPng = async () => {
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

  const stepId = STEPS[step]?.id

  const goNext = async () => {
    if (step < STEPS.length - 2) {
      await saveSurveyDraft()
      setStep((s) => s + 1)
      return
    }
    if (step === STEPS.length - 2) {
      await buildPlan()
    }
  }

  const goPrev = () => setStep((s) => Math.max(0, s - 1))

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
            onClick={() => healthReady && setStep(i)}
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

      {stepId === 'result' && plan && (
        <section className="card nutrition-panel">
          <div className="nutrition-result-header">
            <div>
              <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
                Мерный рацион на день
              </h2>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Цель ~{plan.kcalTarget} ккал · факт {plan.totals?.kcal ?? '—'} ккал
                {kcalDelta != null && Math.abs(kcalDelta) > 30 ? (
                  <span className="nutrition-kcal-delta"> ({kcalDelta > 0 ? '+' : ''}{kcalDelta})</span>
                ) : null}
                {' · '}
                {plan.mealsPerDay} приёма · Б {plan.macros.proteinG} · Ж {plan.macros.fatG} · У {plan.macros.carbsG}
                {generatedAt ? ` · ${formatDateRu(generatedAt.slice(0, 10))}` : ''}
              </p>
              {!readOnly ? (
                <p className="muted nutrition-edit-hint" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Можно подправить граммы в таблице — подытоги пересчитаются автоматически.
                </p>
              ) : null}
            </div>
            <div className="nutrition-result-actions">
              <button type="button" className="btn btn-touch" disabled={exportBusy} onClick={() => void exportPng()}>
                <Share2 size={18} aria-hidden />
                Поделиться / PNG
              </button>
              <button type="button" className="btn btn-touch btn-ghost" disabled={exportBusy} onClick={() => void exportPng()}>
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
            {plan.dayPlan.map((meal) => (
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
                          {readOnly ? (
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
                                onBlur={(e) => void onItemGramsChange(meal.slot, item.productId, e.target.value)}
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
            <strong>Итого за день:</strong> {plan.totals.kcal} ккал (цель {plan.kcalTarget}) · Б {plan.totals.proteinG} · Ж{' '}
            {plan.totals.fatG} · У {plan.totals.carbsG}
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            {plan.disclaimer}
          </p>

          {planHistory.length > 0 ? (
            <section style={{ marginTop: 16 }}>
              <h3 className="section-title" style={{ fontSize: '0.95rem' }}>
                Предыдущие рационы
              </h3>
              <ul className="nutrition-plan-history" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {planHistory.map((h) => (
                  <li key={h.generated_at} style={{ marginBottom: 6 }}>
                    <span className="muted">{formatDateRu(String(h.generated_at).slice(0, 10))}</span>
                    {' — '}
                    <strong>{h.kcalTarget ?? h.plan?.kcalTarget ?? '—'} ккал</strong>
                    {h.mealsPerDay ? ` · ${h.mealsPerDay} приёма` : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      )}

      {stepId === 'result' && !plan && (
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
          <button type="button" className="btn btn-touch btn-ghost" onClick={() => setStep(0)}>
            Изменить ответы
          </button>
          <button type="button" className="btn btn-touch" disabled={busy} onClick={() => void buildPlan()}>
            Пересобрать рацион
          </button>
        </div>
      )}
    </div>
  )
}
