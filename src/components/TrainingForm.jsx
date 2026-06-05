import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, List, Plus, X } from 'lucide-react'
import { listExercises, LOCAL_DATA_CHANGED } from '../lib/dataAccess'
import { stripDirectionControls } from '../lib/textInput'
import {
  TRAINING_EXERCISE_FORMATS,
  exerciseFormatIsCardio,
  exerciseFormatWithSetHr,
  normalizeExerciseFormat,
} from '../lib/trainingExerciseFormat'
import {
  SUPERSET_MAX_SIZE,
  cleanupSupersetGroups,
  isJoinedWithPrevious,
  supersetChainBounds,
  supersetRailRole,
  toggleSupersetWithPrevious,
} from '../lib/trainingSuperset'

function newEmptyExerciseRow(format = 'Силовая') {
  return {
    id: crypto.randomUUID(),
    name: '',
    /** UUID из таблицы exercises; только выбор из справочника, при наборе текста без совпадения — null */
    catalog_exercise_id: null,
    muscle_focus: '',
    /** Силовая | Функциональная | Кардио — формат подходов для этого упражнения */
    format: normalizeExerciseFormat(format),
    sets: [{ reps: '', weight_kg: '', tut_sec: '', load: '', rpe: '', hr_after: '' }],
    /** A–Z: соседние упражнения с той же буквой — суперсет (2–3 подряд). */
    superset_group: null,
  }
}

const steps = [
  { id: 'survey', title: 'Опрос' },
  { id: 'warmup', title: 'Разминка' },
  { id: 'main', title: 'Упражнения' },
  { id: 'cooldown', title: 'Заминка' },
  { id: 'summary', title: 'Итог' },
]

const MOODS = [
  { v: 1, label: '😫' },
  { v: 2, label: '😕' },
  { v: 3, label: '😐' },
  { v: 4, label: '🙂' },
  { v: 5, label: '😄' },
]

function normExerciseName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function filterExerciseCatalog(catalog, query, filterGroup = '') {
  const q = normExerciseName(query)
  let list = [...catalog].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
  if (filterGroup) {
    list = list.filter((row) => (row.muscle_group ?? '') === filterGroup)
  }
  if (!q) return list
  return list.filter((row) => {
    const hay = `${row.name ?? ''} ${row.muscle_group ?? ''} ${row.primary_muscles ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
}

function resolveCatalogExercise(catalog, typedName) {
  const cand = normExerciseName(typedName)
  if (!cand) return null
  return catalog.find((r) => normExerciseName(r.name) === cand) ?? null
}

/** @param {string} [trainingType] — fallback при пустом списке (тип сессии из trainings.type) */
export function TrainingForm({ value, onChange, trainingType = 'Силовая' }) {
  const [step, setStep] = useState(0)
  const [focusExerciseIdx, setFocusExerciseIdx] = useState(null)
  const [pickExerciseIdx, setPickExerciseIdx] = useState(null)
  const [pickSearch, setPickSearch] = useState('')
  const [pickFilterGroup, setPickFilterGroup] = useState('')
  const catalogSearchRef = useRef(null)
  const [catalogList, setCatalogList] = useState([])
  const [suggestOpenId, setSuggestOpenId] = useState(null)
  const exercisesRef = useRef([])
  /** Пока в родителе exercises: [], нельзя каждый рендер создавать новый id — иначе input размонтируется и ввод «не печатается». */
  const emptyExercisePlaceholderRef = useRef(null)
  const current = steps[step]
  const workout = value

  const setWorkout = (patch) => {
    onChange((prev) => ({ ...prev, ...patch }))
  }

  const sessionFallback = normalizeExerciseFormat(trainingType)

  const exercises = useMemo(() => {
    if (Array.isArray(workout.exercises) && workout.exercises.length > 0) {
      emptyExercisePlaceholderRef.current = null
      return workout.exercises
    }
    if (!emptyExercisePlaceholderRef.current) {
      emptyExercisePlaceholderRef.current = newEmptyExerciseRow(sessionFallback)
    }
    return [emptyExercisePlaceholderRef.current]
  }, [workout.exercises, sessionFallback])

  const formatForNewExercise = () => {
    if (!exercises.length) return sessionFallback
    const last = exercises[exercises.length - 1]
    return normalizeExerciseFormat(last?.format, sessionFallback)
  }

  const syncExercises = (next) => setWorkout({ exercises: cleanupSupersetGroups(next) })
  const addExercise = () => syncExercises([...exercises, newEmptyExerciseRow(formatForNewExercise())])
  const removeExercise = (idx) => {
    const next = exercises.filter((_, i) => i !== idx)
    syncExercises(next.length ? next : [newEmptyExerciseRow(sessionFallback)])
  }

  const patchExercise = (idx, ex) => {
    const next = exercises.slice()
    next[idx] = ex
    syncExercises(next)
  }

  exercisesRef.current = exercises

  const addSet = (exIdx) => {
    const ex = exercises[exIdx]
    const sets = [...ex.sets, { reps: '', weight_kg: '', tut_sec: '', load: '', rpe: '', hr_after: '' }]
    patchExercise(exIdx, { ...ex, sets })
  }

  const removeSet = (exIdx, setIdx) => {
    const ex = exercises[exIdx]
    const sets = ex.sets.filter((_, i) => i !== setIdx)
    patchExercise(exIdx, { ...ex, sets })
  }

  const summaryText = useMemo(() => {
    const names = exercises.map((e) => e.name).filter(Boolean)
    return names.length ? names.join(', ') : 'Упражнения не названы'
  }, [exercises])

  const focusEx = focusExerciseIdx != null ? exercises[focusExerciseIdx] : null
  const focusCatalogRow = useMemo(() => {
    if (!focusEx) return null
    const cid = String(focusEx.catalog_exercise_id ?? '').trim()
    if (cid) return catalogList.find((r) => String(r?.id ?? '').trim() === cid) ?? null
    if (focusEx.name?.trim()) return resolveCatalogExercise(catalogList, focusEx.name)
    return null
  }, [focusEx, catalogList])

  const exerciseFormatButtons = (ex, exIdx) => (
    <div className="row exercise-format-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>
        Формат
      </span>
      {TRAINING_EXERCISE_FORMATS.map((t, i) => {
        const active = normalizeExerciseFormat(ex.format, sessionFallback) === t
        return (
          <button
            key={t}
            type="button"
            className={`btn ${active ? 'btn-primary' : 'btn-ghost'} btn-icon-square btn-icon-xs`}
            onClick={() => patchExercise(exIdx, { ...ex, format: t })}
            title={`Формат ${i + 1}: ${t}`}
            aria-label={`Формат ${i + 1}: ${t}`}
            aria-pressed={active}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )

  useEffect(() => {
    let cancelled = false
    const loadCatalog = async () => {
      try {
        const rows = await listExercises()
        if (!cancelled) setCatalogList(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setCatalogList([])
      }
    }
    void loadCatalog()
    const onStorage = (e) => {
      if (e?.detail?.reason === 'exercises') void loadCatalog()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onStorage)
    return () => {
      cancelled = true
      window.removeEventListener(LOCAL_DATA_CHANGED, onStorage)
    }
  }, [])

  const catalogGroups = useMemo(() => {
    const s = new Set()
    for (const ex of catalogList) {
      if (ex.muscle_group) s.add(ex.muscle_group)
    }
    return [...s].sort()
  }, [catalogList])

  const catalogFiltered = useMemo(
    () => filterExerciseCatalog(catalogList, pickSearch, pickFilterGroup),
    [pickSearch, pickFilterGroup, catalogList],
  )

  useEffect(() => {
    if (pickExerciseIdx == null) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPickExerciseIdx(null)
        setSuggestOpenId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickExerciseIdx])

  useEffect(() => {
    if (pickExerciseIdx == null) return
    const t = window.setTimeout(() => catalogSearchRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [pickExerciseIdx])

  useEffect(() => {
    setPickExerciseIdx(null)
    setSuggestOpenId(null)
  }, [step])

  return (
    <div className="steps">
      <div className="step-nav tabs" role="tablist">
        {steps.map((s, i) => (
          <button key={s.id} type="button" className="tab" aria-selected={i === step} onClick={() => setStep(i)}>
            {i + 1}. {s.title}
          </button>
        ))}
      </div>

      {current.id === 'survey' && (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Опрос перед тренировкой</h3>
          <div className="field">
            <span className="label">Самочувствие (1–5)</span>
            <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 }}>
              {MOODS.map((m) => (
                <button
                  key={m.v}
                  type="button"
                  className={`btn ${Number(workout.mood) === m.v ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '1.35rem', minWidth: 48 }}
                  onClick={() => setWorkout({ mood: String(m.v) })}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Желание тренироваться (1–5)</span>
            <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${Number(workout.desire) === n ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setWorkout({ desire: String(n) })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label className="label">Сон, часы</label>
              <input className="input" type="number" min={0} max={24} step={0.5} value={workout.sleep_hours ?? ''} onChange={(e) => setWorkout({ sleep_hours: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Часов после еды</label>
              <input className="input" type="number" min={0} value={workout.hours_after_meal ?? ''} onChange={(e) => setWorkout({ hours_after_meal: e.target.value })} />
            </div>
          </div>
        </section>
      )}

      {current.id === 'warmup' && (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Разминка</h3>
          <div className="field">
            <label className="label">Что делали</label>
            <textarea className="textarea" placeholder="Суставная гимнастика, лёгкий кардио…" value={workout.warmup ?? ''} onChange={(e) => setWorkout({ warmup: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Длительность, мин</label>
            <input className="input" type="number" min={0} value={workout.warmup_duration_min ?? ''} onChange={(e) => setWorkout({ warmup_duration_min: e.target.value })} />
          </div>
        </section>
      )}

      {current.id === 'main' && (
        <section className="card">
          <div className="training-exercises-head">
            <h3 style={{ margin: 0 }}>Упражнения</h3>
            <button
              type="button"
              className="btn btn-primary btn-icon-square btn-touch training-exercises-add"
              onClick={addExercise}
              title="Добавить упражнение"
              aria-label="Добавить упражнение"
            >
              <Plus size={20} aria-hidden />
            </button>
          </div>
          {exercises.map((ex, exIdx) => {
            const railRole = supersetRailRole(exercises, exIdx)
            const inSuperset = Boolean(railRole)
            const joinedPrev = isJoinedWithPrevious(exercises, exIdx)
            const prevChain = exIdx > 0 ? supersetChainBounds(exercises, exIdx - 1) : null
            const canJoinSuperset = exIdx > 0 && (joinedPrev || !prevChain || prevChain.size < SUPERSET_MAX_SIZE)

            return (
            <div
              key={ex.id}
              className={`training-exercise-block${inSuperset ? ` training-exercise-block--superset training-exercise-block--superset-${railRole}` : ''}`}
              style={{ marginTop: 14, paddingTop: 14, borderTop: exIdx ? '1px solid var(--border)' : 'none' }}
            >
              {inSuperset ? (
                <span className="training-superset-rail" title={`Суперсет ${ex.superset_group}`}>
                  {railRole === 'start' ? `СС ${ex.superset_group}` : ''}
                </span>
              ) : null}
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                <div className="field exercise-name-field exercise-catalog-combo" style={{ flex: '1 1 240px', marginBottom: 0 }}>
                  <label className="label">Упражнение</label>
                  <div className="exercise-name-row">
                    <input
                      className="input"
                      value={ex.name}
                      disabled={!catalogList.length}
                      onChange={(e) => {
                        patchExercise(exIdx, {
                          ...ex,
                          name: stripDirectionControls(e.target.value),
                          catalog_exercise_id: null,
                        })
                        setSuggestOpenId(ex.id)
                      }}
                      onFocus={() => {
                        if (catalogList.length) setSuggestOpenId(ex.id)
                      }}
                      onBlur={() => {
                        const idx = exIdx
                        window.setTimeout(() => {
                          setSuggestOpenId((open) => (open === ex.id ? null : open))
                          const cur = exercisesRef.current[idx]
                          if (!cur) return
                          const row = resolveCatalogExercise(catalogList, cur.name)
                          const q = normExerciseName(cur.name)
                          if (!q) {
                            patchExercise(idx, { ...cur, name: '', catalog_exercise_id: null })
                            return
                          }
                          if (row) {
                            patchExercise(idx, { ...cur, name: String(row.name).trim(), catalog_exercise_id: row.id })
                            return
                          }
                          patchExercise(idx, { ...cur, name: '', catalog_exercise_id: null })
                        }, 180)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const list = filterExerciseCatalog(catalogList, ex.name)
                          const first = list[0]
                          if (first) {
                            patchExercise(exIdx, { ...ex, name: String(first.name).trim(), catalog_exercise_id: first.id })
                            setSuggestOpenId(null)
                          }
                        }
                        if (e.key === 'Escape') setSuggestOpenId(null)
                      }}
                      placeholder={catalogList.length ? 'Печать — подсказки или кнопка списка' : 'Справочник пуст — админ добавит упражнения'}
                      aria-label="Упражнение: поиск по справочнику"
                      aria-expanded={suggestOpenId === ex.id}
                      aria-controls={suggestOpenId === ex.id ? `exercise-suggest-${ex.id}` : undefined}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost exercise-catalog-open-btn"
                      onClick={() => {
                        setSuggestOpenId(null)
                        setPickFilterGroup('')
                        setPickSearch((exercises[exIdx]?.name ?? '').trim())
                        setPickExerciseIdx(exIdx)
                      }}
                      disabled={!catalogList.length}
                      aria-label="Открыть справочник в окне"
                      title="Справочник в окне"
                    >
                      <List size={18} aria-hidden />
                    </button>
                  </div>
                  {suggestOpenId === ex.id && catalogList.length > 0 ? (
                    <div id={`exercise-suggest-${ex.id}`} className="exercise-catalog-suggest" role="listbox">
                      {filterExerciseCatalog(catalogList, ex.name).length === 0 ? (
                        <div className="exercise-catalog-suggest__empty">Нет совпадений — уточните запрос или откройте список</div>
                      ) : (
                        filterExerciseCatalog(catalogList, ex.name)
                          .slice(0, 50)
                          .map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              role="option"
                              className="exercise-catalog-suggest__item"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                patchExercise(exIdx, { ...ex, name: String(row.name ?? '').trim(), catalog_exercise_id: row.id })
                                setSuggestOpenId(null)
                              }}
                            >
                              <span className="training-exercise-catalog__opt-title">{row.name}</span>
                              {row.muscle_group ? <span className="training-exercise-catalog__opt-meta">{row.muscle_group}</span> : null}
                            </button>
                          ))
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {exIdx > 0 ? (
                    <button
                      type="button"
                      className={`btn ${joinedPrev ? 'btn-primary' : 'btn-ghost'} btn-touch training-superset-toggle`}
                      onClick={() => syncExercises(toggleSupersetWithPrevious(exercises, exIdx))}
                      disabled={!canJoinSuperset && !joinedPrev}
                      title={
                        joinedPrev
                          ? 'Убрать из суперсета с предыдущим'
                          : `Суперсет с предыдущим (до ${SUPERSET_MAX_SIZE} подряд)`
                      }
                      aria-label={joinedPrev ? 'Убрать из суперсета' : 'Суперсет с предыдущим'}
                      aria-pressed={joinedPrev}
                    >
                      СС
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-square"
                    onClick={() => setFocusExerciseIdx(exIdx)}
                    title="Направленность / группа"
                    aria-label="Направленность / группа"
                  >
                    <Info size={18} aria-hidden />
                  </button>
                  <button type="button" className="btn btn-ghost btn-touch" onClick={() => removeExercise(exIdx)} disabled={exercises.length < 2}>
                    Удалить
                  </button>
                </div>
              </div>
              {exerciseFormatButtons(ex, exIdx)}
              {ex.sets.map((st, setIdx) => {
                const exFormat = normalizeExerciseFormat(ex.format, sessionFallback)
                const isCardio = exerciseFormatIsCardio(exFormat)
                const withSetHr = exerciseFormatWithSetHr(exFormat)
                return (
                <div key={setIdx} className={`set-row-compact${withSetHr ? ' set-row-compact--functional' : ''}`}>
                  <span className="set-row-compact__idx">{setIdx + 1}</span>
                  {isCardio ? (
                    <>
                      <div className="field">
                        <label className="label">Время под нагрузкой</label>
                        <input
                          className="input"
                          inputMode="numeric"
                          placeholder="мин"
                          title="Сколько минут длился отрезок/подход"
                          value={st.tut_sec ?? ''}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, tut_sec: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                      <div className="field">
                        <label className="label">Нагрузка</label>
                        <input
                          className="input"
                          inputMode="decimal"
                          placeholder="уровень/кг/км"
                          title="Например: уровень дорожки/эллипса, скорость, сопротивление или кг"
                          value={st.load ?? ''}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, load: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                      <div className="field">
                        <label className="label">Пульс</label>
                        <input
                          className="input"
                          inputMode="numeric"
                          title="Пульс после отрезка/подхода (уд/мин)"
                          value={st.hr_after ?? ''}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, hr_after: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                      <div className="field">
                        <label className="label">RPE</label>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={10}
                          value={st.rpe ?? ''}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, rpe: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label className="label">Повт.</label>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={st.reps}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, reps: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                      <div className="field">
                        <label className="label">Вес, кг</label>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={st.weight_kg}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, weight_kg: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                      <div className="field">
                        <label className="label">RPE</label>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={10}
                          value={st.rpe ?? ''}
                          onChange={(e) => {
                            const sets = ex.sets.slice()
                            sets[setIdx] = { ...st, rpe: e.target.value }
                            patchExercise(exIdx, { ...ex, sets })
                          }}
                        />
                      </div>
                      {withSetHr && (
                        <div className="field">
                          <label className="label">Пульс</label>
                          <input
                            className="input"
                            inputMode="numeric"
                            value={st.hr_after ?? ''}
                            onChange={(e) => {
                              const sets = ex.sets.slice()
                              sets[setIdx] = { ...st, hr_after: e.target.value }
                              patchExercise(exIdx, { ...ex, sets })
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                  <button type="button" className="btn btn-ghost" style={{ marginBottom: 2, minHeight: 42 }} onClick={() => removeSet(exIdx, setIdx)} disabled={ex.sets.length < 2} aria-label="Удалить подход">
                    <X size={18} />
                  </button>
                </div>
                )
              })}
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => addSet(exIdx)}>
                + Подход
              </button>
            </div>
            )
          })}
        </section>
      )}

      {current.id === 'cooldown' && (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Заминка</h3>
          <div className="field">
            <label className="label">Что делали</label>
            <textarea className="textarea" value={workout.cooldown ?? ''} onChange={(e) => setWorkout({ cooldown: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Длительность, мин</label>
            <input className="input" type="number" min={0} value={workout.cooldown_duration_min ?? ''} onChange={(e) => setWorkout({ cooldown_duration_min: e.target.value })} />
          </div>
        </section>
      )}

      {current.id === 'summary' && (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Итог</h3>
          <p className="muted">Ключевые упражнения: {summaryText}</p>
          <div className="field">
            <span className="label">Оценка (1–5 звёзд)</span>
            <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${Number(workout.stars) === n ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setWorkout({ stars: String(n) })}
                  aria-label={`${n} звёзд`}
                >
                  {'★'.repeat(n)}
                  {'☆'.repeat(5 - n)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="label">Комментарий</label>
            <textarea className="textarea" value={workout.trainer_comment ?? ''} onChange={(e) => setWorkout({ trainer_comment: e.target.value })} />
          </div>
        </section>
      )}

      {pickExerciseIdx != null && exercises[pickExerciseIdx] && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-catalog-title"
          onClick={() => {
            setPickExerciseIdx(null)
            setSuggestOpenId(null)
          }}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="grid" style={{ gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                <h3 id="exercise-catalog-title" style={{ margin: 0 }}>
                  Справочник упражнений
                </h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square"
                  aria-label="Закрыть"
                  title="Закрыть"
                  onClick={() => {
                    setPickExerciseIdx(null)
                    setSuggestOpenId(null)
                  }}
                >
                  ✕
                </button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Список задаёт администратор. Можно выбрать здесь или подобрать по буквам в поле на форме — сохраняется только упражнение из справочника.
              </p>
              <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
                  <label className="label" htmlFor="exercise-catalog-search">
                    Поиск
                  </label>
                  <input
                    ref={catalogSearchRef}
                    id="exercise-catalog-search"
                    className="input"
                    value={pickSearch}
                    onChange={(e) => setPickSearch(stripDirectionControls(e.target.value))}
                    placeholder="Начните вводить название…"
                    autoComplete="off"
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
                  <label className="label" htmlFor="exercise-catalog-group">
                    Направленность
                  </label>
                  <select
                    id="exercise-catalog-group"
                    className="select"
                    value={pickFilterGroup}
                    onChange={(e) => setPickFilterGroup(e.target.value)}
                  >
                    <option value="">Все</option>
                    {catalogGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="training-exercise-catalog-scroll">
                {catalogList.length === 0 ? (
                  <p className="muted" style={{ margin: '12px 8px', fontSize: 14 }}>
                    В справочнике пока нет упражнений — их добавляет администратор (Структура → Упражнения).
                  </p>
                ) : catalogFiltered.length === 0 ? (
                  <p className="muted" style={{ margin: '12px 8px', fontSize: 14 }}>
                    Ничего не найдено — измените поиск или направленность.
                  </p>
                ) : (
                  <ul className="training-exercise-catalog-list">
                    {catalogFiltered.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="training-exercise-catalog__opt"
                          onClick={() => {
                            const ex = exercises[pickExerciseIdx]
                            patchExercise(pickExerciseIdx, {
                              ...ex,
                              name: String(row.name ?? '').trim(),
                              catalog_exercise_id: row.id,
                            })
                            setPickExerciseIdx(null)
                            setSuggestOpenId(null)
                          }}
                        >
                          <span className="training-exercise-catalog__opt-title">{row.name}</span>
                          {row.muscle_group ? (
                            <span className="training-exercise-catalog__opt-meta">{row.muscle_group}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {focusEx != null && focusExerciseIdx != null && (
        <div
          className="modal-overlay"
          style={{ alignItems: 'center' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-pop-title"
          onClick={() => setFocusExerciseIdx(null)}
        >
          <div className="training-focus-pop" onClick={(e) => e.stopPropagation()}>
            <div className="training-focus-pop__head">
              <h4 id="focus-pop-title" className="training-focus-pop__title">
                Направленность / группа
              </h4>
              <button type="button" className="btn btn-ghost" onClick={() => setFocusExerciseIdx(null)} aria-label="Закрыть">
                <X size={22} />
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
              {focusEx.name?.trim() ? `Упражнение: ${focusEx.name}` : 'Без названия'}
            </p>
            {focusCatalogRow ? (
              <div style={{ margin: '0 0 10px' }}>
                {focusCatalogRow.muscle_group ? (
                  <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                    Направленность: <span style={{ color: 'var(--text)' }}>{focusCatalogRow.muscle_group}</span>
                  </div>
                ) : null}
                {focusCatalogRow.primary_muscles ? (
                  <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                    Основные мышцы: <span style={{ color: 'var(--text)' }}>{focusCatalogRow.primary_muscles}</span>
                  </div>
                ) : null}
                {focusCatalogRow.comment ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Примечание: <span style={{ color: 'var(--text)' }}>{focusCatalogRow.comment}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                В справочнике нет описания для этого упражнения (выберите из списка справочника).
              </p>
            )}
            <label className="label" style={{ marginBottom: 6 }}>
              Заметка тренера (направленность / акцент)
            </label>
            <textarea
              className="textarea"
              placeholder="Например: квадрицепс, силовой акцент…"
              value={focusEx.muscle_focus ?? ''}
              onChange={(e) => patchExercise(focusExerciseIdx, { ...focusEx, muscle_focus: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function emptyTrainingData() {
  return {
    pre_weight_kg: '',
    mood: '',
    desire: '',
    sleep_hours: '',
    hours_after_meal: '',
    warmup: '',
    warmup_duration_min: '',
    training_focus: '',
    exercises: [newEmptyExerciseRow()],
    cooldown: '',
    cooldown_duration_min: '',
    trainer_comment: '',
    stars: '',
  }
}
