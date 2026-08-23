import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { listMeasurements, listMemberships } from '../../lib/dataAccess'
import { listTrainingsByClientId } from '../../lib/localDbClubQuery'
import { ensureClientTrainingsCachedWithStatus } from '../../lib/clientTrainingsEnsure'
import {
  clientStatsModeNeedsTrainingsEnsure,
  normalizeClientStatsMode,
  persistClientStatsMode,
  readPersistedClientStatsMode,
  resolveClientStatsAllTimeRange,
  shouldForceClientTrainingsEnsureOnReload,
  shouldReloadTrainerClientStatsForClient,
} from '../../lib/clientStatsModeCore'
import { writeClientCardTabToSearchParams } from '../../lib/clientCardTabsCore'
import { isTrainingStatusCompleted } from '../../lib/trainingPersistStatusCore'
import { isSupabaseConfigured } from '../../lib/supabase'
import { isAppOnline } from '../../lib/syncService'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload'
import { BODY_MEASURE_FIELDS, getMeasureValue } from '../../lib/bodyMeasures'
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { collectSetLoadNums, collectSetHrAfterNums, collectSetRpeNums } from '../../lib/trainingSetLateralityCore'
import { ClientAttendanceSection } from './ClientAttendanceSection'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const MEASURE_KEYS = BODY_MEASURE_FIELDS

function PlusIcon({ className }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

const EX_METRICS = [
  { id: 'weight', label: 'Вес' },
  { id: 'reps', label: 'Повторы' },
  { id: 'tut_sec', label: 'Время под нагрузкой' },
  { id: 'load', label: 'Нагрузка' },
  { id: 'hr_after', label: 'Пульс после подхода' },
]

const PALETTE = [
  { line: 'rgb(74, 222, 128)', fill: 'rgba(74, 222, 128, 0.15)' },
  { line: 'rgb(96, 165, 250)', fill: 'rgba(96, 165, 250, 0.15)' },
  { line: 'rgb(250, 204, 21)', fill: 'rgba(250, 204, 21, 0.12)' },
  { line: 'rgb(244, 114, 182)', fill: 'rgba(244, 114, 182, 0.12)' },
  { line: 'rgb(167, 139, 250)', fill: 'rgba(167, 139, 250, 0.12)' },
  { line: 'rgb(45, 212, 191)', fill: 'rgba(45, 212, 191, 0.12)' },
]

/** Сопоставление с выбором в статистике: по id справочника или по подстроке имени (старые записи без id). */
function exerciseMatchesSelection(ex, catalogId, nameSearch) {
  if (!ex) return false
  if (catalogId) return ex.catalog_exercise_id === catalogId
  const q = nameSearch.trim().toLowerCase()
  if (!q) return false
  const n = String(ex.name ?? '').trim()
  return n.length > 0 && n.toLowerCase().includes(q)
}

export function Statistics({ clientId, initialMode = null }) {
  const [mode, setModeState] = useState(() => {
    const fromUrl = normalizeClientStatsMode(initialMode)
    if (fromUrl) return fromUrl
    const persisted = readPersistedClientStatsMode(clientId)
    if (persisted) return persisted
    return 'measurements'
  })
  const appliedAllTimeKeyRef = useRef(null)
  const userEditedRangeRef = useRef(false)

  const markRangeEdited = useCallback(() => {
    userEditedRangeRef.current = true
  }, [])

  const setMode = useCallback(
    (next) => {
      const m = normalizeClientStatsMode(next) ?? 'measurements'
      setModeState(m)
      persistClientStatsMode(clientId, m)
    },
    [clientId],
  )
  const [exerciseName, setExerciseName] = useState('')
  /** UUID из справочника exercises; null — режим поиска по тексту имени */
  const [exerciseCatalogId, setExerciseCatalogId] = useState(null)
  const [selectedParams, setSelectedParams] = useState(['waist_lower'])
  const [selectedExMetrics, setSelectedExMetrics] = useState(['weight'])
  const [paramsOpen, setParamsOpen] = useState(false)
  const [exMetricsOpen, setExMetricsOpen] = useState(false)
  const [exPickerOpen, setExPickerOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })
  const [dateTo, setDateTo] = useState(() => todayLocalIso())
  const [measurements, setMeasurements] = useState([])
  const [trainings, setTrainings] = useState([])
  const [membershipStartDates, setMembershipStartDates] = useState([])
  const [trainingsOnline, setTrainingsOnline] = useState(true)
  const [trainingsEnsureOk, setTrainingsEnsureOk] = useState(true)
  const [trainingsLoading, setTrainingsLoading] = useState(false)

  const inD = useCallback((dateStr, from, to) => dateStr && dateStr >= from && dateStr <= to, [])

  const allTimeRange = useMemo(
    () => resolveClientStatsAllTimeRange(mode, { measurements, trainings }, todayLocalIso()),
    [mode, measurements, trainings],
  )

  const applyAllTime = useCallback(() => {
    if (!allTimeRange) return
    userEditedRangeRef.current = false
    setDateFrom(allTimeRange.min)
    setDateTo(allTimeRange.max)
    appliedAllTimeKeyRef.current = `${allTimeRange.min}:${allTimeRange.max}`
  }, [allTimeRange])

  const load = useCallback(async (opts = {}) => {
    const needEnsure = clientStatsModeNeedsTrainingsEnsure(mode)
    const forceEnsure = opts.forceEnsure === true
    if (needEnsure) setTrainingsLoading(true)
    try {
      const [measures, mems, cached] = await Promise.all([
        listMeasurements(clientId),
        listMemberships(clientId),
        needEnsure
          ? ensureClientTrainingsCachedWithStatus(clientId, { force: forceEnsure })
          : listTrainingsByClientId(clientId).then((trainings) => ({
              trainings,
              online: Boolean(isSupabaseConfigured() && isAppOnline()),
              ensureOk: true,
            })),
      ])
      setMeasurements(measures)
      setMembershipStartDates(
        (mems ?? []).map((m) => String(m?.start_date ?? '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      )
      setTrainings(cached.trainings)
      setTrainingsOnline(cached.online)
      setTrainingsEnsureOk(cached.ensureOk)
    } finally {
      if (needEnsure) setTrainingsLoading(false)
    }
  }, [clientId, mode])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const fromUrl = normalizeClientStatsMode(initialMode)
    const next = fromUrl ?? readPersistedClientStatsMode(clientId) ?? 'measurements'
    setModeState(next)
    if (fromUrl) persistClientStatsMode(clientId, fromUrl)
    appliedAllTimeKeyRef.current = null
    userEditedRangeRef.current = false
  }, [clientId, initialMode])

  useEffect(() => {
    if (mode !== 'attendance') return
    if (trainingsLoading || !allTimeRange) return
    if (userEditedRangeRef.current) return
    const key = `${allTimeRange.min}:${allTimeRange.max}`
    if (appliedAllTimeKeyRef.current === key) return
    setDateFrom(allTimeRange.min)
    setDateTo(allTimeRange.max)
    appliedAllTimeKeyRef.current = key
  }, [mode, trainingsLoading, allTimeRange, clientId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    writeClientCardTabToSearchParams(url.searchParams, 'stats', {
      statsMode: mode,
      clearStatsMode: false,
    })
    const next = `${url.pathname}${url.search}${url.hash}`
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (cur !== next) window.history.replaceState(window.history.state, '', next)
  }, [mode])

  useDebouncedStorageReload(
    (detail) =>
      void load({ forceEnsure: shouldForceClientTrainingsEnsureOnReload(detail) }),
    { shouldRun: (detail) => shouldReloadTrainerClientStatsForClient(clientId, detail) },
  )

  useEffect(() => {
    // страхуемся от пустого выбора
    if (mode === 'measurements' && selectedParams.length === 0) setSelectedParams(['waist_lower'])
    if (mode === 'exercise' && selectedExMetrics.length === 0) setSelectedExMetrics(['weight'])
  }, [mode, selectedParams.length, selectedExMetrics.length])

  useEffect(() => {
    if (mode !== 'measurements') setParamsOpen(false)
  }, [mode])

  useEffect(() => {
    if (mode !== 'exercise') setExMetricsOpen(false)
  }, [mode])

  useEffect(() => {
    if (mode !== 'exercise') setExPickerOpen(false)
  }, [mode])

  const toggleSelected = (arr, id) => {
    if (arr.includes(id)) return arr.filter((x) => x !== id)
    return [...arr, id]
  }

  const exerciseOptions = useMemo(() => {
    const byCatalog = new Map()
    const legacy = new Set()
    for (const t of trainings) {
      if (!isTrainingStatusCompleted(t?.status)) continue
      const exs = t?.data?.exercises ?? []
      for (const ex of exs) {
        const cid = ex?.catalog_exercise_id
        const n = String(ex?.name ?? '').trim()
        if (cid && typeof cid === 'string') {
          if (!byCatalog.has(cid)) byCatalog.set(cid, n || 'Упражнение')
        } else if (n) legacy.add(n)
      }
    }
    const out = []
    for (const [id, label] of byCatalog) out.push({ kind: 'catalog', id, label })
    for (const n of [...legacy].sort((a, b) => a.localeCompare(b, 'ru'))) out.push({ kind: 'legacy', id: null, label: n })
    return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [trainings])

  const filteredExerciseOptions = useMemo(() => {
    const q = exerciseName.trim().toLowerCase()
    if (!q) return exerciseOptions
    return exerciseOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [exerciseOptions, exerciseName])

  const chartBody = useMemo(() => {
    if (mode === 'measurements') {
      const rows = [...measurements].filter((m) => inD(m.date, dateFrom, dateTo)).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      const labels = rows.map((r) => formatDateRu(r.date))
      return {
        labels,
        datasets: selectedParams.map((p, idx) => {
          const c = PALETTE[idx % PALETTE.length]
          return {
            label: MEASURE_KEYS.find((x) => x.id === p)?.label ?? p,
            data: rows.map((r) => {
              const v = getMeasureValue(r, p)
              return v != null && v !== '' ? Number(v) : null
            }),
            borderColor: c.line,
            backgroundColor: c.fill,
            tension: 0.25,
            spanGaps: true,
          }
        }),
      }
    }
    if (mode === 'weight') {
      const rows = [...trainings]
        .filter((t) => inD(t.date, dateFrom, dateTo) && isTrainingStatusCompleted(t?.status))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      const labels = rows.map((r) => formatDateRu(r.date))
      const data = rows.map((r) => {
        const w = r.data?.pre_weight_kg
        return w != null && w !== '' ? Number(w) : null
      })
      return {
        labels,
        datasets: [
          {
            label: 'Вес до тренировки (кг)',
            data,
            borderColor: 'rgb(96, 165, 250)',
            backgroundColor: 'rgba(96, 165, 250, 0.15)',
            tension: 0.25,
            spanGaps: true,
          },
        ],
      }
    }
    const name = exerciseName.trim().toLowerCase()
    if (!exerciseCatalogId && !name) {
      return {
        labels: [],
        datasets: [],
      }
    }
    const byMetric = new Map(selectedExMetrics.map((m) => [m, new Map()]))
    for (const t of trainings) {
      if (!inD(t.date, dateFrom, dateTo) || !isTrainingStatusCompleted(t?.status)) continue
      const exs = t.data?.exercises ?? []
      for (const ex of exs) {
        if (!exerciseMatchesSelection(ex, exerciseCatalogId, exerciseName)) continue
        const sets = ex.sets ?? []
        for (const m of selectedExMetrics) {
          let val = null
          if (m === 'weight') {
            const nums = collectSetLoadNums(sets, 'weight_kg')
            val = nums.length ? Math.max(...nums) : null
          } else if (m === 'reps') {
            const nums = collectSetLoadNums(sets, 'reps')
            val = nums.length ? Math.max(...nums) : null
          } else if (m === 'tut_sec') {
            const nums = sets.map((s) => Number(s.tut_sec)).filter((n) => !Number.isNaN(n) && n > 0)
            val = nums.length ? nums.reduce((a, b) => a + b, 0) : null
          } else if (m === 'load') {
            const nums = sets.map((s) => Number(s.load)).filter((n) => !Number.isNaN(n) && n > 0)
            val = nums.length ? Math.max(...nums) : null
          } else if (m === 'rpe') {
            const nums = collectSetRpeNums(sets)
            val = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
          } else {
            const nums = collectSetHrAfterNums(sets)
            val = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
          }
          if (val != null) byMetric.get(m)?.set(t.date, val)
        }
      }
    }
    const labels = [...new Set([].concat(...[...byMetric.values()].map((m) => [...m.keys()])))].sort()
    return {
      labels: labels.map((d) => formatDateRu(d)),
      datasets: selectedExMetrics.map((m, idx) => {
        const c = PALETTE[idx % PALETTE.length]
        const map = byMetric.get(m) ?? new Map()
        return {
          label: `${exerciseName || 'Упражнение'} · ${EX_METRICS.find((x) => x.id === m)?.label ?? m}`,
          data: labels.map((d) => (map.has(d) ? map.get(d) : null)),
          borderColor: c.line,
          backgroundColor: c.fill,
          tension: 0.25,
          spanGaps: true,
        }
      }),
    }
  }, [mode, selectedParams, exerciseName, exerciseCatalogId, selectedExMetrics, measurements, trainings, dateFrom, dateTo, inD])

  const tableRows = useMemo(() => {
    if (mode === 'measurements') {
      return [...measurements].filter((m) => inD(m.date, dateFrom, dateTo)).sort((a, b) => String(b.date).localeCompare(String(a.date)))
    }
    if (mode === 'weight') {
      return [...trainings]
        .filter((t) => inD(t.date, dateFrom, dateTo) && isTrainingStatusCompleted(t?.status))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((t) => ({ date: t.date, val: t.data?.pre_weight_kg ?? '—' }))
    }
    if (mode === 'exercise') {
      const name = exerciseName.trim().toLowerCase()
      if (!exerciseCatalogId && !name) return []
      const inRange = [...trainings]
        .filter((t) => inD(t.date, dateFrom, dateTo) && isTrainingStatusCompleted(t?.status))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      return inRange.map((t) => {
        const exs = t.data?.exercises ?? []
        const found = exs.find((ex) => exerciseMatchesSelection(ex, exerciseCatalogId, exerciseName))
        const sets = found?.sets ?? []
        const row = { date: t.date }
        for (const m of selectedExMetrics) {
          if (m === 'weight') {
            const nums = collectSetLoadNums(sets, 'weight_kg')
            row[m] = nums.length ? Math.max(...nums) : '—'
          } else if (m === 'reps') {
            const nums = collectSetLoadNums(sets, 'reps')
            row[m] = nums.length ? Math.max(...nums) : '—'
          } else if (m === 'tut_sec') {
            const nums = sets.map((s) => Number(s.tut_sec)).filter((n) => !Number.isNaN(n) && n > 0)
            row[m] = nums.length ? nums.reduce((a, b) => a + b, 0) : '—'
          } else if (m === 'load') {
            const nums = sets.map((s) => Number(s.load)).filter((n) => !Number.isNaN(n) && n > 0)
            row[m] = nums.length ? Math.max(...nums) : '—'
          } else if (m === 'rpe') {
            const nums = collectSetRpeNums(sets)
            row[m] = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : '—'
          } else {
            const nums = collectSetHrAfterNums(sets)
            row[m] = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : '—'
          }
        }
        return row
      })
    }
    return []
  }, [mode, measurements, trainings, dateFrom, dateTo, exerciseName, exerciseCatalogId, selectedExMetrics, inD])

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
          Статистика
        </h2>
        <div className="grid grid-2" style={{ gap: 12, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="sr-only">Режим</label>
            <select className="select" aria-label="Режим" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="measurements">Обмеры тела</option>
              <option value="weight">Вес</option>
              <option value="exercise">Упражнение</option>
              <option value="attendance">Посещаемость</option>
            </select>
          </div>
          {mode === 'measurements' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="sr-only">Параметры (можно несколько)</label>
              <div className="stats-params-toggle-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square"
                  aria-label={paramsOpen ? 'Скрыть параметры' : 'Показать параметры'}
                  title={paramsOpen ? 'Скрыть параметры' : 'Показать параметры'}
                  aria-expanded={paramsOpen ? 'true' : 'false'}
                  aria-controls="stats-measure-params"
                  onClick={() => setParamsOpen((v) => !v)}
                >
                  <PlusIcon className={`stats-params-arm${paramsOpen ? ' is-open' : ''}`} />
                  <span className="sr-only">{paramsOpen ? 'Скрыть параметры' : 'Показать параметры'}</span>
                </button>
              </div>
              <div id="stats-measure-params" className={`stats-params-banner${paramsOpen ? ' is-open' : ''}`}>
                <div className="check-grid check-grid--compact">
                  {MEASURE_KEYS.map((k) => (
                    <label key={k.id} className="check-item check-item--compact">
                      <input type="checkbox" checked={selectedParams.includes(k.id)} onChange={() => setSelectedParams((v) => toggleSelected(v, k.id))} />
                      <span>{k.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {mode === 'exercise' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="sr-only">Название упражнения (поиск)</label>
              <div className="stats-ex-row">
                <input
                  className="input stats-ex-input"
                  aria-label="Название упражнения (поиск)"
                  value={exerciseName}
                  onChange={(e) => {
                    setExerciseName(e.target.value)
                    setExerciseCatalogId(null)
                  }}
                  onFocus={() => setExPickerOpen(false)}
                />
                <div className="stats-ex-picker">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-square"
                    aria-label={exPickerOpen ? 'Скрыть список упражнений' : 'Открыть список упражнений'}
                    title={exPickerOpen ? 'Скрыть список упражнений' : 'Открыть список упражнений'}
                    aria-expanded={exPickerOpen ? 'true' : 'false'}
                    aria-controls="stats-ex-list"
                    onClick={() => setExPickerOpen((v) => !v)}
                  >
                    <svg className="stats-params-arm" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M7 14h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M7 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M19 8l2 2-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
                    </svg>
                    <span className="sr-only">Список</span>
                  </button>
                  {exPickerOpen && (
                    <div id="stats-ex-list" className="stats-ex-pop" role="listbox" aria-label="Список упражнений">
                      {filteredExerciseOptions.length ? (
                        filteredExerciseOptions.slice(0, 40).map((o) => (
                          <button
                            key={o.kind === 'catalog' ? o.id : `legacy:${o.label}`}
                            type="button"
                            className="stats-ex-pop__item"
                            role="option"
                            onClick={() => {
                              setExerciseName(o.label)
                              setExerciseCatalogId(o.kind === 'catalog' ? o.id : null)
                              setExPickerOpen(false)
                            }}
                          >
                            {o.label}
                            {o.kind === 'catalog' ? <span className="stats-ex-pop__badge">справочник</span> : null}
                          </button>
                        ))
                      ) : (
                        <div className="stats-ex-pop__empty">Нет совпадений</div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square"
                  aria-label={exMetricsOpen ? 'Скрыть показатели' : 'Показать показатели'}
                  title={exMetricsOpen ? 'Скрыть показатели' : 'Показать показатели'}
                  aria-expanded={exMetricsOpen ? 'true' : 'false'}
                  aria-controls="stats-ex-metrics"
                  onClick={() => setExMetricsOpen((v) => !v)}
                >
                  <PlusIcon className={`stats-params-arm${exMetricsOpen ? ' is-open' : ''}`} />
                  <span className="sr-only">{exMetricsOpen ? 'Скрыть показатели' : 'Показать показатели'}</span>
                </button>
              </div>
              <div id="stats-ex-metrics" className={`stats-params-banner${exMetricsOpen ? ' is-open' : ''}`}>
                <div className="check-grid check-grid--compact">
                  {EX_METRICS.map((m) => (
                    <label key={m.id} className="check-item check-item--compact">
                      <input type="checkbox" checked={selectedExMetrics.includes(m.id)} onChange={() => setSelectedExMetrics((v) => toggleSelected(v, m.id))} />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="stats-range-row">
            <div className="field stats-range-field" style={{ marginBottom: 0 }}>
              <label className="sr-only">С даты</label>
              <input className="input" aria-label="С даты" type="date" value={dateFrom} onChange={(e) => { markRangeEdited(); setDateFrom(e.target.value) }} />
            </div>
            <div className="field stats-range-field" style={{ marginBottom: 0 }}>
              <label className="sr-only">По дату</label>
              <input className="input" aria-label="По дату" type="date" value={dateTo} onChange={(e) => { markRangeEdited(); setDateTo(e.target.value) }} />
            </div>
            <div className="field stats-range-action" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="btn btn-ghost btn-touch stats-range-action__btn"
                onClick={applyAllTime}
                disabled={!allTimeRange}
                aria-label="За всё время"
                title="За всё время"
              >
                За всё время
              </button>
            </div>
          </div>
        </div>
        {mode === 'attendance' ? (
          <ClientAttendanceSection
            trainings={trainings}
            dateFrom={dateFrom}
            dateTo={dateTo}
            online={trainingsOnline}
            ensureOk={trainingsEnsureOk}
            membershipStartDates={membershipStartDates}
            loading={trainingsLoading}
          />
        ) : (
        <>
        {trainingsLoading && clientStatsModeNeedsTrainingsEnsure(mode) ? (
          <p className="muted" style={{ margin: '0 0 8px' }} aria-busy="true">
            Загрузка дневника…
          </p>
        ) : null}
        <div className="stats-chart-shell">
          <Line
            data={chartBody}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              layout: { padding: { top: 6, left: 6, right: 10, bottom: 6 } },
              plugins: {
                legend: {
                  position: 'top',
                  align: 'center',
                  labels: {
                    color: '#d4d4d8',
                    boxWidth: 14,
                    boxHeight: 14,
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                    padding: 16,
                    font: { size: 12, weight: '600' },
                  },
                },
                tooltip: {
                  backgroundColor: 'rgba(10, 12, 11, 0.95)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  titleColor: '#e5e7eb',
                  bodyColor: '#e5e7eb',
                  displayColors: true,
                  padding: 10,
                },
              },
              elements: {
                line: { borderWidth: 3 },
                point: { radius: 4, hoverRadius: 6, borderWidth: 2 },
              },
              scales: {
                x: {
                  ticks: { color: 'rgba(229,231,235,0.72)' },
                  grid: { color: 'rgba(255,255,255,0.045)' },
                },
                y: {
                  ticks: { color: 'rgba(229,231,235,0.72)' },
                  grid: { color: 'rgba(255,255,255,0.045)' },
                },
              },
            }}
          />
        </div>
        </>
        )}
      </div>

      {mode !== 'attendance' && (
      <div className="card">
        <h3 className="section-title" style={{ fontSize: '1rem' }}>
          Таблица
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                {mode === 'measurements' && selectedParams.map((p) => <th key={p}>{MEASURE_KEYS.find((x) => x.id === p)?.label ?? p}</th>)}
                {mode === 'weight' && <th>Вес (кг)</th>}
                {mode === 'exercise' && selectedExMetrics.map((m) => <th key={m}>{EX_METRICS.find((x) => x.id === m)?.label ?? m}</th>)}
              </tr>
            </thead>
            <tbody>
              {mode === 'measurements' &&
                tableRows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateRu(r.date)}</td>
                    {selectedParams.map((p) => (
                      <td key={p}>{getMeasureValue(r, p) ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              {mode === 'weight' &&
                tableRows.map((r, i) => (
                  <tr key={i}>
                    <td>{formatDateRu(r.date)}</td>
                    <td>{r.val}</td>
                  </tr>
                ))}
              {mode === 'exercise' &&
                tableRows.map((r, i) => (
                  <tr key={i}>
                    <td>{formatDateRu(r.date)}</td>
                    {selectedExMetrics.map((m) => (
                      <td key={m}>{r[m] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
