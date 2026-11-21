import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { clientShowsFromTrainerTab } from '../../lib/chat/clientAzChatCore.js'
import { liveHallsFromMembershipViews } from '../../lib/client/clientHomeHallCore.js'
import { fetchClientPlanItem, fetchClientPlanList } from '../../lib/client/clientPlansService.js'
import { shiftIsoDate, sumFoodDiaryDay } from '../../lib/client/foodDiaryDayCore.js'
import { buildFrequentFoods } from '../../lib/client/foodDiaryHabitsCore.js'
import {
  copyFoodDiaryDay,
  deleteFoodDiaryEntry,
  fetchFoodDiaryDay,
  fetchFoodDiaryFrequent,
  fetchFoodDiaryWater,
  fetchFoodDiaryTargets,
  fetchFoodDiaryWeek,
  importFoodDiaryFromPlan,
  setFoodDiaryTargets,
  setFoodDiaryWater,
  upsertFoodDiaryEntry,
} from '../../lib/client/foodDiaryService.js'
import {
  filterFoodDiaryRowsByMealKeys,
  foodDiaryRowsFromPlanDay,
  resolveFoodDiaryFromPlanConflict,
} from '../../lib/client/foodDiaryFromPlanCore.js'
import { mergeFoodDiaryTargets, targetsFromNutritionPlan } from '../../lib/client/foodDiaryVsPlanCore.js'
import { buildFoodDiaryWeekSeries, foodDiaryWeekRangeEnding } from '../../lib/client/foodDiaryWeekCore.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientFoodDiaryTabs } from './ClientFoodDiaryTabs.jsx'
import { ClientFoodDiaryDay } from './ClientFoodDiaryDay.jsx'
import { ClientFoodDiaryReports } from './ClientFoodDiaryReports.jsx'
import { ClientFoodDiaryMore } from './ClientFoodDiaryMore.jsx'
import { ClientFoodDiaryRation } from './ClientFoodDiaryRation.jsx'
import { ClientFoodDiaryAddSheet } from './ClientFoodDiaryAddSheet.jsx'

const TAB_IDS = new Set(['day', 'reports', 'ration', 'more'])

/**
 * Каркас дневника. ПЗ: цели из рациона (свои — запас). АЗ/ТЗ: свои цели / дефолты.
 */
export function ClientFoodDiaryView({
  club = null,
  client = null,
  memberships = null,
  attention = false,
  note = '',
  asOf,
  previewDay = null,
  localOnly = false,
  previewShowRation = false,
  previewRationItem = null,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const liveHalls = Array.isArray(memberships?.current)
    ? liveHallsFromMembershipViews(memberships.current)
    : null
  const showRation =
    previewShowRation || (!localOnly && clientShowsFromTrainerTab(client, { liveHalls }))

  const tabFromUrl = String(searchParams.get('tab') || '')
  const initialTab =
    showRation && tabFromUrl === 'ration' ? 'ration' : TAB_IDS.has(tabFromUrl) && tabFromUrl !== 'ration' ? tabFromUrl : 'day'

  const [tab, setTab] = useState(initialTab)
  const [entryDate, setEntryDate] = useState(() => previewDay?.entry_date || asOf)
  const [entries, setEntries] = useState(() => previewDay?.entries ?? [])
  const [waterMl, setWaterMl] = useState(0)
  const [frequent, setFrequent] = useState([])
  const [week, setWeek] = useState(null)
  const [personalTargets, setPersonalTargets] = useState(null)
  const [planTargets, setPlanTargets] = useState(null)
  const [targets, setTargets] = useState(() => mergeFoodDiaryTargets(null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [sheet, setSheet] = useState(/** @type {null | { meal?: string, entry?: object }} */ (null))

  const applyMergedTargets = useCallback((plan, personal) => {
    setPlanTargets(plan)
    setPersonalTargets(personal)
    setTargets(mergeFoodDiaryTargets({ plan, personal }))
  }, [])

  const setTabSafe = useCallback(
    (next) => {
      const id = next === 'ration' && !showRation ? 'day' : next
      setTab(id)
      if (id === 'ration') setSearchParams({ tab: 'ration' }, { replace: true })
      else if (searchParams.get('tab')) setSearchParams({}, { replace: true })
    },
    [showRation, searchParams, setSearchParams],
  )

  useEffect(() => {
    if (!showRation && tab === 'ration') setTab('day')
  }, [showRation, tab])

  const applyDay = useCallback((data) => {
    if (!data) return
    setEntryDate(data.entry_date)
    setEntries(data.entries ?? [])
  }, [])

  const loadDayTargets = useCallback(async () => {
    if (localOnly) {
      applyMergedTargets(null, null)
      return
    }
    let personal = null
    let plan = null
    try {
      const data = await fetchFoodDiaryTargets()
      personal = data?.targets ?? null
    } catch {
      personal = null
    }
    if (showRation) {
      try {
        const { items } = await fetchClientPlanList('nutrition')
        const first = items?.[0]
        if (first?.id) {
          const { item } = await fetchClientPlanItem(first.id)
          plan = targetsFromNutritionPlan(item?.payload)
        }
      } catch {
        plan = null
      }
    }
    applyMergedTargets(plan, personal)
  }, [localOnly, showRation, applyMergedTargets])

  const loadFrequent = useCallback(async () => {
    if (localOnly) {
      setFrequent(buildFrequentFoods(previewDay?.entries ?? [], { limit: 8 }))
      return
    }
    try {
      const data = await fetchFoodDiaryFrequent(8)
      setFrequent(data?.frequent ?? [])
    } catch {
      /* не блокируем день */
    }
  }, [localOnly, previewDay])

  const loadWater = useCallback(
    async (date) => {
      if (localOnly) {
        setWaterMl(0)
        return
      }
      try {
        const data = await fetchFoodDiaryWater(date)
        setWaterMl(Number(data?.ml) || 0)
      } catch {
        setWaterMl(0)
      }
    },
    [localOnly],
  )

  const loadWeek = useCallback(
    async (endDate) => {
      if (localOnly) {
        const range = foodDiaryWeekRangeEnding(endDate)
        if (!range.ok) return
        const series = buildFoodDiaryWeekSeries(previewDay?.entries ?? [], range.dates)
        setWeek({
          days: series.days,
          week_totals: series.weekTotals,
          days_with_food: series.daysWithFood,
          avg_kcal: series.avgKcal,
        })
        return
      }
      try {
        const data = await fetchFoodDiaryWeek(endDate)
        setWeek(data)
      } catch {
        setWeek(null)
      }
    },
    [localOnly, previewDay],
  )

  const loadDay = useCallback(
    async (date) => {
      if (localOnly) {
        setEntryDate(date)
        if (previewDay && date === previewDay.entry_date) setEntries(previewDay.entries ?? [])
        else setEntries([])
        setWaterMl(0)
        return
      }
      setBusy(true)
      setError('')
      try {
        const data = await fetchFoodDiaryDay(date)
        applyDay(data)
        await loadWater(date)
      } catch (e) {
        setError(e?.message || 'Не удалось загрузить день')
      } finally {
        setBusy(false)
      }
    },
    [applyDay, localOnly, previewDay, loadWater],
  )

  useEffect(() => {
    if (localOnly) {
      void loadFrequent()
      return
    }
    void loadDay(asOf)
    void loadFrequent()
    void loadDayTargets()
  }, [localOnly, asOf, loadDay, loadFrequent, loadDayTargets])

  useEffect(() => {
    if (tab === 'reports') void loadWeek(entryDate)
  }, [tab, entryDate, loadWeek])

  const onDateChange = (next) => {
    if (next > asOf) return
    setEntryDate(next)
    void loadDay(next)
  }

  const onSave = async (parsed) => {
    setBusy(true)
    setError('')
    try {
      if (localOnly) {
        const id = parsed.id || `preview-${Date.now()}`
        const row = {
          id,
          entry_date: parsed.entry_date,
          meal_key: parsed.meal_key,
          name: parsed.name,
          grams: parsed.grams,
          kcal: parsed.kcal,
          protein_g: parsed.protein_g,
          fat_g: parsed.fat_g,
          carbs_g: parsed.carbs_g,
          fiber_g: parsed.fiber_g,
          sugar_g: parsed.sugar_g,
          sodium_mg: parsed.sodium_mg,
        }
        setEntries((prev) => {
          const rest = prev.filter((e) => e.id !== id)
          return [...rest, row]
        })
        setSheet(null)
        return
      }
      const data = await upsertFoodDiaryEntry({
        id: parsed.id,
        entry_date: parsed.entry_date,
        meal_key: parsed.meal_key,
        name: parsed.name,
        grams: parsed.grams,
        kcal: parsed.kcal,
        protein_g: parsed.protein_g,
        fat_g: parsed.fat_g,
        carbs_g: parsed.carbs_g,
        fiber_g: parsed.fiber_g,
        sugar_g: parsed.sugar_g,
        sodium_mg: parsed.sodium_mg,
      })
      applyDay(data)
      setSheet(null)
      void loadFrequent()
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    const id = sheet?.entry?.id
    if (!id) return
    setBusy(true)
    setError('')
    try {
      if (localOnly) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        setSheet(null)
        return
      }
      const data = await deleteFoodDiaryEntry(id)
      applyDay(data)
      setSheet(null)
      void loadFrequent()
    } catch (e) {
      setError(e?.message || 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  const onWaterChange = async (ml) => {
    setWaterMl(ml)
    if (localOnly) return
    try {
      await setFoodDiaryWater(entryDate, ml)
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить воду')
    }
  }

  const onQuickAdd = (f) => {
    void onSave({
      ok: true,
      id: null,
      entry_date: entryDate,
      meal_key: f.meal_key || sheet?.meal || 'snack',
      name: f.name,
      grams: f.grams,
      kcal: f.kcal,
      protein_g: f.protein_g,
      fat_g: f.fat_g,
      carbs_g: f.carbs_g,
      fiber_g: f.fiber_g ?? 0,
      sugar_g: f.sugar_g ?? 0,
      sodium_mg: f.sodium_mg ?? 0,
    })
  }

  const runCopy = async (meal_key) => {
    const from = shiftIsoDate(entryDate, -1)
    if (localOnly) {
      setError('Копирование в превью недоступно')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await copyFoodDiaryDay({ from_date: from, to_date: entryDate, meal_key })
      applyDay(data)
      void loadFrequent()
      setTabSafe('day')
    } catch (e) {
      setError(e?.message || 'Не удалось скопировать')
    } finally {
      setBusy(false)
    }
  }

  const onImportToDiary = async ({ planId, planPayload, dayIndex, mode, mealKeys, entryDate: date }) => {
    if (localOnly) {
      let rows = foodDiaryRowsFromPlanDay(planPayload, dayIndex)
      if (mealKeys?.length) rows = filterFoodDiaryRowsByMealKeys(rows, mealKeys)
      if (!rows.length) {
        setError('В выбранных приёмах нет блюд')
        return
      }
      const dateIso = date || entryDate
      const occupied = [...new Set(entries.filter((e) => e.entry_date === dateIso).map((e) => e.meal_key))]
      const resolution = resolveFoodDiaryFromPlanConflict(mode, occupied, rows)
      if (!resolution.ok) {
        setError(resolution.error)
        return
      }
      const del = new Set(resolution.delete_meal_keys || [])
      const kept = entries.filter((e) => !(e.entry_date === dateIso && del.has(e.meal_key)))
      const added = resolution.rows.map((r, i) => ({
        id: `preview-from-plan-${Date.now()}-${i}`,
        entry_date: dateIso,
        ...r,
      }))
      setEntries([...kept, ...added])
      setToast('Добавлено в дневник (превью)')
      setTabSafe('day')
      return
    }
    setBusy(true)
    setError('')
    setToast('')
    try {
      const data = await importFoodDiaryFromPlan({
        entry_date: date || entryDate,
        plan_id: planId,
        plan_payload: planPayload,
        day_index: dayIndex,
        mode,
        meal_keys: mealKeys,
      })
      applyDay(data)
      void loadFrequent()
      setToast('Добавлено в дневник')
      setTabSafe('day')
    } catch (e) {
      setError(e?.message || 'Не удалось перенести в дневник')
    } finally {
      setBusy(false)
    }
  }

  const onPickDayFromWeek = (date) => {
    onDateChange(date)
    setTabSafe('day')
  }

  const onSaveTargets = async (value) => {
    setBusy(true)
    setError('')
    setToast('')
    try {
      if (localOnly) {
        applyMergedTargets(planTargets, value)
        setToast('Цели сохранены (превью)')
        return
      }
      const data = await setFoodDiaryTargets(value)
      applyMergedTargets(planTargets, data?.targets ?? value)
      setToast('Цели сохранены')
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить цели')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClientMeShell club={club} tabs attention={attention}>
      <div className="os-enter food-diary-page">
        {note ? (
          <p className="client-me-offline" role="note">
            {note}
          </p>
        ) : null}
        {toast ? (
          <p className="food-diary-toast" role="status">
            {toast}
          </p>
        ) : null}
        <ClientFoodDiaryTabs value={tab} onChange={setTabSafe} showRation={showRation} />

        {tab === 'day' ? (
          <ClientFoodDiaryDay
            asOf={asOf}
            entryDate={entryDate}
            entries={entries}
            waterMl={waterMl}
            busy={busy}
            error={error}
            targets={targets}
            onDateChange={onDateChange}
            onAdd={(meal) => setSheet({ meal })}
            onEdit={(entry) => setSheet({ entry, meal: entry.meal_key })}
            onWaterChange={(ml) => void onWaterChange(ml)}
          />
        ) : null}

        {tab === 'reports' ? (
          <ClientFoodDiaryReports
            entries={entries}
            week={week}
            busy={busy}
            targets={targets}
            onPickDay={onPickDayFromWeek}
          />
        ) : null}

        {tab === 'ration' && showRation ? (
          <ClientFoodDiaryRation
            entryDate={entryDate}
            busy={busy}
            previewItem={localOnly ? previewRationItem : null}
            onImportToDiary={(p) => void onImportToDiary(p)}
          />
        ) : null}

        {tab === 'more' ? (
          <ClientFoodDiaryMore
            entryDate={entryDate}
            asOf={asOf}
            busy={busy}
            localOnly={localOnly}
            personalTargets={personalTargets}
            planOverrides={Boolean(planTargets)}
            onSaveTargets={(v) => void onSaveTargets(v)}
            onCopyYesterday={() => void runCopy(undefined)}
            onCopyMeal={(meal) => void runCopy(meal)}
          />
        ) : null}
      </div>
      {sheet ? (
        <ClientFoodDiaryAddSheet
          asOf={asOf}
          entryDate={entryDate}
          initial={sheet.entry ?? null}
          defaultMeal={sheet.meal || 'breakfast'}
          busy={busy}
          error={error}
          localOnly={localOnly}
          frequent={frequent}
          onClose={() => setSheet(null)}
          onSave={onSave}
          onDelete={sheet.entry?.id ? onDelete : undefined}
          onQuickAdd={onQuickAdd}
        />
      ) : null}
    </ClientMeShell>
  )
}

/** Пример дня для DEV-превью. */
export function foodDiaryPreviewSample(asOf = '2026-11-21') {
  const entries = [
    {
      id: 'p1',
      entry_date: asOf,
      meal_key: 'breakfast',
      name: 'Овсянка с ягодами',
      grams: 250,
      kcal: 280,
      protein_g: 12,
      fat_g: 6,
      carbs_g: 45,
      fiber_g: 6,
      sugar_g: 12,
      sodium_mg: 80,
    },
    {
      id: 'p2',
      entry_date: asOf,
      meal_key: 'lunch',
      name: 'Куриная грудка с рисом',
      grams: 320,
      kcal: 420,
      protein_g: 45,
      fat_g: 8,
      carbs_g: 40,
      fiber_g: 2,
      sugar_g: 1,
      sodium_mg: 420,
    },
  ]
  return { entry_date: asOf, entries, totals: sumFoodDiaryDay(entries) }
}
