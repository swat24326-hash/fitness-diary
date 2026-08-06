import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { SalesHomeTiles } from '../../components/SalesHomeTiles.jsx'
import { isSupabaseConfigured } from '../../lib/supabase'
import { addDaysToIso, clampIsoDateToToday, formatDateRu, todayLocalIso } from '../../lib/dateRu'
import { calendarYearMonthFromIso } from '../../lib/admin/salesPlanPzDkSuggestCore.js'
import {
  dailyRowToForm,
  emptyDailyForm,
  emptyExpenseForm,
  emptyPlanForm,
  expenseRowToForm,
  planRowToForm,
  monthPartsFromIso,
  parseSalesMoney,
  resolvePlanFactFromMonthSummary,
} from '../../lib/admin/salesReportCore'
import { buildClubFinanceForecast } from '../../lib/admin/clubFinanceForecastCore'
import { computePlanDirectionsFromForm, buildPlanMatrixJsonFromForm } from '../../lib/admin/salesPlanMatrixCore'
import {
  buildTrainingsMatrixColumns,
  hydrateTrainingsMatrixInputMap,
  normalizeMatrixRowsFromDb,
} from '../../lib/admin/salesTrainingsMatrix'
import {
  aerobicRowsToInputMap,
  buildAerobicSalesMatrixColumns,
  normalizeAerobicRowsFromDb,
} from '../../lib/admin/aerobicSalesMatrix'
import {
  ensureMembershipTypesForClub,
  filterAerobicSalesTypes,
  listMembershipTypesForClub,
} from '../../lib/membershipTypesService'
import { humanizeNetworkError } from '../../lib/supabaseRetry'
import {
  fetchClubSalesBundle,
  saveClubSalesDaily,
  saveClubSalesFinance,
  saveClubSalesPlan,
} from '../../lib/admin/adminSalesService'
import { clearSalesPlanGlanceSession } from '../../lib/admin/salesPlanGlanceSession.js'
import {
  invalidateSalesShellSession,
  shouldSkipSalesShellNetwork,
  readSalesShellSession,
  writeSalesShellSession,
} from '../../lib/admin/salesShellSession.js'
import { pickMembershipTypesForSalesReport } from '../../lib/admin/salesMembershipTypesAccessCore.js'
import {
  buildDailyDraftPayload,
  buildExpenseDraftPayload,
  buildPlanDraftPayload,
  clearSalesDraft,
  fingerprintDailyDraft,
  fingerprintExpenseDraft,
  fingerprintPlanDraft,
  readSalesDraft,
  resolveDailyDraftAfterLoad,
  resolveExpenseDraftAfterLoad,
  resolvePlanDraftAfterLoad,
  salesDailyDraftKey,
  salesFinanceDraftKey,
  salesPlanDraftKey,
  shouldPersistSalesDraft,
  writeSalesDraft,
} from '../../lib/admin/adminSalesDraftStorage'
import { SalesPlanVessel } from '../../components/SalesPlanVessel'
import { AdminHomeSalesGlanceMetrics } from '../../components/admin/AdminHomeSalesGlanceMetrics.jsx'
import { SalesDailyForm } from '../../components/SalesDailyForm'
import { SalesDailyPaymentsImportSection } from '../../components/SalesDailyPaymentsImportSection.jsx'
import { SalesDailyPzTrainingsImportSection } from '../../components/SalesDailyPzTrainingsImportSection.jsx'
import { SalesDailyTaskAssign } from '../../components/sales/SalesDailyTaskAssign.jsx'
import { SalesClipCreateSection } from '../../components/sales/SalesClipCreateSection.jsx'
import { SalesFinancePanel } from '../../components/SalesFinancePanel'
import { SalesPlanSettingsPanel } from '../../components/SalesPlanSettingsPanel'
import { SalesStrategyPanel } from '../../components/SalesStrategyPanel'
import { SalesManagerStatsPanel } from '../../components/SalesManagerStatsPanel'
import { SalesManagerAnalyticsPanel } from '../../components/SalesManagerAnalyticsPanel'
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary'
import { AdminHomeAttentionRow } from '../../components/admin/AdminHomeAttentionRow'
import { PriceListHallShell } from '../../components/priceList/PriceListHallShell.jsx'
import '../../styles/sales-report.css'
import '../../styles/sales-strategy.css'
import '../../styles/sales-strategy-playbook.css'

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

export function AdminSales({ accessMode = 'admin' }) {
  const isSalesManager = accessMode === 'sales_manager'
  const isSupervisor = accessMode === 'supervisor'
  const clubBound = isSalesManager || isSupervisor
  const { user, profilePending, refreshUserProfile } = useAuth()
  const ctx = useOutletContext()
  const clubIdCtx = ctx?.clubId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const clubId = clubBound
    ? String(user?.club_id ?? '').trim()
    : searchParams.get('club') ?? clubIdCtx ?? ''
  const salesTabParam = searchParams.get('tab')
  const salesTab = useMemo(() => {
    if (isSalesManager) {
      if (salesTabParam === 'stats') return 'stats'
      if (salesTabParam === 'report') return 'report'
      if (salesTabParam === 'analytics') return 'analytics'
      if (salesTabParam === 'price') return 'price'
      if (salesTabParam === 'strategy') return 'strategy'
      if (salesTabParam === 'clips') return 'clips'
      return 'home'
    }
    if (salesTabParam === 'finance') return 'finance'
    if (salesTabParam === 'plan') return 'plan'
    if (salesTabParam === 'strategy') return 'strategy'
    if (salesTabParam === 'stats') return 'stats'
    if (salesTabParam === 'price') return 'price'
    if (salesTabParam === 'clips') return 'clips'
    return 'daily'
  }, [isSalesManager, salesTabParam])
  const showSalesHero = !isSalesManager || salesTab === 'home'
  const showFinanceTab = !isSalesManager
  const showInternalTabs = !isSalesManager
  /** Не размонтировать Стратегию при уходе на другие вкладки — иначе playbook пропадает до «Посчитать». */
  const [keepStrategyPanel, setKeepStrategyPanel] = useState(false)
  useEffect(() => {
    if (salesTab === 'strategy') setKeepStrategyPanel(true)
  }, [salesTab])

  useEffect(() => {
    if (isSalesManager && (salesTabParam === 'finance' || salesTabParam === 'plan')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('tab')
        return next
      }, { replace: true })
    }
  }, [isSalesManager, salesTabParam, setSearchParams])

  const setSalesTab = (tab) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'daily') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const [reportDate, setReportDate] = useState(() => todayLocalIso())
  const [dailyForm, setDailyForm] = useState(emptyDailyForm)
  const [planForm, setPlanForm] = useState(emptyPlanForm)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [monthSummary, setMonthSummary] = useState(null)
  const [monthDays, setMonthDays] = useState([])
  const [busy, setBusy] = useState(false)
  const [savingDaily, setSavingDaily] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingFinance, setSavingFinance] = useState(false)
  const [error, setError] = useState('')
  const [loadHint, setLoadHint] = useState('')
  const [vesselPulse, setVesselPulse] = useState(0)
  const [toast, setToast] = useState(null)
  const [financeFeedback, setFinanceFeedback] = useState(null)
  const [yearMonth, setYearMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
  const [membershipTypes, setMembershipTypes] = useState([])
  const [trainers, setTrainers] = useState([])
  const [fitCityTypeStats, setFitCityTypeStats] = useState(null)
  const [trainingsMatrix, setTrainingsMatrix] = useState({})
  const [aerobicMatrix, setAerobicMatrix] = useState({})
  const [attentionWidgets, setAttentionWidgets] = useState({
    hasPnk: false,
    hasPlanerka: false,
    sideCount: 0,
  })
  const dailyBaselineFpRef = useRef('')
  const planBaselineFpRef = useRef('')
  const expenseBaselineFpRef = useRef('')
  const toastTimerRef = useRef(0)
  const financeFeedbackTimerRef = useRef(0)

  const membershipTypeColumns = useMemo(
    () => buildTrainingsMatrixColumns(membershipTypes),
    [membershipTypes],
  )

  const aerobicMembershipTypes = useMemo(
    () => filterAerobicSalesTypes(membershipTypes),
    [membershipTypes],
  )

  const aerobicTypeColumns = useMemo(
    () => buildAerobicSalesMatrixColumns(aerobicMembershipTypes),
    [aerobicMembershipTypes],
  )

  const showToast = useCallback((text, tone = 'ok') => {
    const msg = String(text ?? '').trim()
    if (!msg) return
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ text: msg, tone })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3600)
  }, [])

  const showFinanceFeedback = useCallback((text, tone = 'ok') => {
    const msg = String(text ?? '').trim()
    if (!msg) return
    if (financeFeedbackTimerRef.current) window.clearTimeout(financeFeedbackTimerRef.current)
    setFinanceFeedback({ text: msg, tone })
    showToast(msg, tone)
    financeFeedbackTimerRef.current = window.setTimeout(() => setFinanceFeedback(null), 5000)
  }, [showToast])

  const loadSeqRef = useRef(0)
  const profilesRef = useRef({ key: '', shell: false, daily: false })

  const applyPlanExpenseDrafts = useCallback((bundle, cid) => {
    let nextPlanForm = planRowToForm(bundle.plan)
    const planServerFp = fingerprintPlanDraft(nextPlanForm)
    planBaselineFpRef.current = planServerFp
    const planDraft = readSalesDraft(salesPlanDraftKey(cid, bundle.year, bundle.month))
    const planResolved = resolvePlanDraftAfterLoad({
      draft: planDraft,
      serverFp: planServerFp,
      planForm: nextPlanForm,
    })
    nextPlanForm = planResolved.planForm

    let nextExpenseForm = expenseRowToForm(bundle.expense)
    const expenseServerFp = fingerprintExpenseDraft(nextExpenseForm)
    expenseBaselineFpRef.current = expenseServerFp
    const expenseDraft = readSalesDraft(salesFinanceDraftKey(cid, bundle.year, bundle.month))
    const expenseResolved = resolveExpenseDraftAfterLoad({
      draft: expenseDraft,
      serverFp: expenseServerFp,
      expenseForm: nextExpenseForm,
    })
    nextExpenseForm = expenseResolved.expenseForm

    setPlanForm(nextPlanForm)
    setExpenseForm(nextExpenseForm)
    return { planResolved, expenseResolved }
  }, [])

  const applyDailyDrafts = useCallback((bundle, types, cid, date) => {
    const matrixRows = normalizeMatrixRowsFromDb(bundle.daily?.trainings_matrix)
    let nextDailyForm = dailyRowToForm(bundle.daily)
    let nextTrainingsMatrix = hydrateTrainingsMatrixInputMap(matrixRows)
    let nextAerobicMatrix = aerobicRowsToInputMap(
      normalizeAerobicRowsFromDb(bundle.daily?.aerobic_sales_matrix),
    )
    const dailyServerFp = fingerprintDailyDraft({
      dailyForm: nextDailyForm,
      trainingsMatrix: nextTrainingsMatrix,
      aerobicMatrix: nextAerobicMatrix,
    })
    dailyBaselineFpRef.current = dailyServerFp
    const dailyDraft = readSalesDraft(salesDailyDraftKey(cid, date))
    const dailyResolved = resolveDailyDraftAfterLoad({
      draft: dailyDraft,
      serverFp: dailyServerFp,
      dailyForm: nextDailyForm,
      trainingsMatrix: nextTrainingsMatrix,
      aerobicMatrix: nextAerobicMatrix,
    })
    setDailyForm(dailyResolved.dailyForm)
    setTrainingsMatrix(dailyResolved.trainingsMatrix)
    setAerobicMatrix(dailyResolved.aerobicMatrix)
    if (Array.isArray(bundle.trainers)) setTrainers(bundle.trainers)
    if (bundle.fitCityTypeStats != null) setFitCityTypeStats(bundle.fitCityTypeStats)
    return dailyResolved
  }, [])

  const applyShellBundle = useCallback(
    (bundle, cid, typesIn, draftHints) => {
      let types = typesIn
      if (bundle.year && bundle.month) {
        setYearMonth({ year: bundle.year, month: bundle.month })
      }
      if (bundle.membershipTypes?.length) {
        types = pickMembershipTypesForSalesReport(types, bundle.membershipTypes)
        setMembershipTypes(types)
      }
      if (bundle.monthSummary != null) setMonthSummary(bundle.monthSummary)
      if (Array.isArray(bundle.monthDays)) setMonthDays(bundle.monthDays)
      const pe = applyPlanExpenseDrafts(bundle, cid)
      if (pe.planResolved.restored) draftHints.push('план')
      if (pe.expenseResolved.restored) draftHints.push('расход')
      profilesRef.current.shell = true
      return types
    },
    [applyPlanExpenseDrafts],
  )

  const loadSalesProfiles = useCallback(
    async ({ force = false, wantDaily = false, wantFitCity = false, wantShell = true } = {}) => {
      if (!clubId || !isSupabaseConfigured()) return
      const key = `${clubId}|${reportDate}`
      if (profilesRef.current.key !== key) {
        profilesRef.current = { key, shell: false, daily: false }
      }

      const needShell = wantShell && (force || !profilesRef.current.shell)
      const needDaily = wantDaily && (force || !profilesRef.current.daily)
      if (!needShell && !needDaily && !wantFitCity) {
        // Прайс: только типы из IDB, без sales shell
        if (!wantShell) {
          const cachedTypes = await listMembershipTypesForClub(clubId)
          if (cachedTypes.length) setMembershipTypes(cachedTypes)
          else {
            const ensured = await ensureMembershipTypesForClub(clubId, { force: true }).catch(() => ({
              types: [],
            }))
            if (ensured.types?.length) setMembershipTypes(ensured.types)
          }
        }
        return
      }

      const seq = ++loadSeqRef.current
      setBusy(true)
      setError('')
      if (force) {
        setLoadHint('')
        invalidateSalesShellSession(clubId)
      }

      try {
        const cachedTypes = await listMembershipTypesForClub(clubId)
        if (cachedTypes.length) setMembershipTypes(cachedTypes)

        const cid = clubId
        const date = reportDate
        const draftHints = []
        let types = cachedTypes
        let skipShellNetwork = false

        if (needShell) {
          const cached = readSalesShellSession(cid, date)
          if (cached?.payload) {
            // Last-good сразу (шляпа не пустая), сеть — если кэш не «только что свой».
            types = applyShellBundle(cached.payload, cid, types, draftHints)
            if (!types.length) {
              const ensured = await ensureMembershipTypesForClub(clubId, { force: true }).catch(() => ({
                types: [],
              }))
              if (ensured.types?.length) {
                types = ensured.types
                setMembershipTypes(types)
              }
            }
            if (!force && shouldSkipSalesShellNetwork(cached.savedAt)) {
              skipShellNetwork = true
            }
          }
        }

        const tasks = []
        if (needShell && !skipShellNetwork) {
          tasks.push(
            fetchClubSalesBundle({ clubId, reportDate, profile: 'shell' }).then((b) => ({
              kind: 'shell',
              bundle: b,
            })),
          )
        }
        if (needShell && skipShellNetwork) {
          profilesRef.current.shell = true
        }
        if (needDaily) {
          tasks.push(
            fetchClubSalesBundle({
              clubId,
              reportDate,
              profile: 'daily',
              includeFitCity: wantFitCity,
            }).then((b) => ({ kind: 'daily', bundle: b })),
          )
        } else if (wantFitCity && profilesRef.current.daily) {
          tasks.push(
            fetchClubSalesBundle({
              clubId,
              reportDate,
              profile: 'daily',
              includeFitCity: true,
            }).then((b) => ({ kind: 'fit', bundle: b })),
          )
        }

        const results = await Promise.all(tasks)
        if (seq !== loadSeqRef.current) return

        for (const { kind, bundle } of results) {
          if (bundle.year && bundle.month) {
            setYearMonth({ year: bundle.year, month: bundle.month })
          }
          if (bundle.membershipTypes?.length) {
            types = pickMembershipTypesForSalesReport(types, bundle.membershipTypes)
            setMembershipTypes(types)
          }

          if (kind === 'shell') {
            types = applyShellBundle(bundle, cid, types, draftHints)
            writeSalesShellSession(cid, date, bundle)
            // Главная glance не должна жить дольше свежей шляпы после чужого отчёта.
            clearSalesPlanGlanceSession(cid)
            if (!types.length) {
              const ensured = await ensureMembershipTypesForClub(clubId, { force: true }).catch(() => ({
                types: [],
              }))
              if (ensured.types?.length) {
                types = ensured.types
                setMembershipTypes(types)
              }
            }
          }

          if (kind === 'daily') {
            types = pickMembershipTypesForSalesReport(types, bundle.membershipTypes)
            setMembershipTypes(types)
            const dailyResolved = applyDailyDrafts(bundle, types, cid, date)
            if (dailyResolved.restored) draftHints.push('дневной отчёт')
            profilesRef.current.daily = true
          }

          if (kind === 'fit' && bundle.fitCityTypeStats != null) {
            setFitCityTypeStats(bundle.fitCityTypeStats)
          }

          if (bundle.warnings?.length) {
            setLoadHint((prev) =>
              [prev, bundle.warnings.filter(Boolean).join(' ')].filter(Boolean).join(' '),
            )
          }
        }

        if (draftHints.length) {
          setLoadHint(`Восстановлен несохранённый черновик: ${draftHints.join(', ')}.`)
        }
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        const ensured = await ensureMembershipTypesForClub(clubId, { force: true }).catch(() => ({
          types: [],
        }))
        if (ensured.types?.length) setMembershipTypes(ensured.types)
        else {
          const cached = await listMembershipTypesForClub(clubId)
          if (cached.length) setMembershipTypes(cached)
        }
        setError(humanizeNetworkError(e) || e?.message || 'Ошибка загрузки')
      } finally {
        if (seq === loadSeqRef.current) setBusy(false)
      }
    },
    [applyDailyDrafts, applyShellBundle, clubId, reportDate],
  )

  /** Ручное «Обновить» и после save — сброс кэша профилей и догрузка под вкладку. */
  const loadBundle = useCallback(async () => {
    profilesRef.current = { key: `${clubId}|${reportDate}`, shell: false, daily: false }
    invalidateSalesShellSession(clubId)
    const wantDaily = isSalesManager
      ? salesTab === 'home' ||
        salesTab === 'report' ||
        salesTab === 'stats' ||
        salesTab === 'analytics'
      : salesTab === 'daily' || salesTab === 'stats'
    const wantShell = salesTab !== 'price'
    await loadSalesProfiles({
      force: true,
      wantDaily,
      wantFitCity: wantDaily,
      wantShell,
    })
  }, [clubId, isSalesManager, loadSalesProfiles, reportDate, salesTab])

  useEffect(() => {
    if (!clubId) return
    const wantDaily = isSalesManager
      ? salesTab === 'home' || salesTab === 'report' || salesTab === 'stats' || salesTab === 'analytics'
      : salesTab === 'daily' || salesTab === 'stats'
    const wantShell = salesTab !== 'price'
    void loadSalesProfiles({ wantDaily, wantFitCity: false, wantShell }).then(() => {
      if (wantDaily) {
        void loadSalesProfiles({ wantFitCity: true, wantShell: false })
      }
    })
  }, [clubId, reportDate, salesTab, isSalesManager, loadSalesProfiles])
  const persistDailyDraft = useCallback(() => {
    if (!clubId || !reportDate) return
    const serverFp = dailyBaselineFpRef.current
    const currentFp = fingerprintDailyDraft({ dailyForm, trainingsMatrix, aerobicMatrix })
    const key = salesDailyDraftKey(clubId, reportDate)
    if (!shouldPersistSalesDraft(serverFp, currentFp)) {
      clearSalesDraft(key)
      return
    }
    writeSalesDraft(
      key,
      buildDailyDraftPayload({
        serverBaselineFp: serverFp,
        dailyForm,
        trainingsMatrix,
        aerobicMatrix,
      }),
    )
  }, [clubId, reportDate, dailyForm, trainingsMatrix, aerobicMatrix])

  const persistPlanDraft = useCallback(() => {
    if (!clubId) return
    const serverFp = planBaselineFpRef.current
    const currentFp = fingerprintPlanDraft(planForm)
    const key = salesPlanDraftKey(clubId, yearMonth.year, yearMonth.month)
    if (!shouldPersistSalesDraft(serverFp, currentFp)) {
      clearSalesDraft(key)
      return
    }
    writeSalesDraft(key, buildPlanDraftPayload({ serverBaselineFp: serverFp, planForm }))
  }, [clubId, planForm, yearMonth.month, yearMonth.year])

  const persistExpenseDraft = useCallback(() => {
    if (!clubId) return
    const serverFp = expenseBaselineFpRef.current
    const currentFp = fingerprintExpenseDraft(expenseForm)
    const key = salesFinanceDraftKey(clubId, yearMonth.year, yearMonth.month)
    if (!shouldPersistSalesDraft(serverFp, currentFp)) {
      clearSalesDraft(key)
      return
    }
    writeSalesDraft(key, buildExpenseDraftPayload({ serverBaselineFp: serverFp, expenseForm }))
  }, [clubId, expenseForm, yearMonth.month, yearMonth.year])

  useEffect(() => {
    const timer = setTimeout(() => {
      persistDailyDraft()
      persistPlanDraft()
      persistExpenseDraft()
    }, 450)
    return () => clearTimeout(timer)
  }, [persistDailyDraft, persistPlanDraft, persistExpenseDraft])

  useEffect(() => {
    const flush = () => {
      persistDailyDraft()
      persistPlanDraft()
      persistExpenseDraft()
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [persistDailyDraft, persistPlanDraft, persistExpenseDraft])

  const monthLabel = useMemo(() => {
    const name = MONTH_NAMES[(yearMonth.month || 1) - 1] ?? ''
    return `${name} ${yearMonth.year}`
  }, [yearMonth])

  const factMonth = resolvePlanFactFromMonthSummary(monthSummary)

  const heroFinanceForecast = useMemo(() => {
    if (isSalesManager) return null
    const expenseRaw = parseSalesMoney(expenseForm.expense_month)
    return buildClubFinanceForecast({
      monthRows: monthDays,
      year: yearMonth.year,
      month: yearMonth.month,
      expense: Number.isFinite(expenseRaw) ? expenseRaw : 0,
      membershipTypes,
      planForm,
    })
  }, [
    isSalesManager,
    monthDays,
    yearMonth.year,
    yearMonth.month,
    expenseForm.expense_month,
    membershipTypes,
    planForm,
  ])

  const softSignals = useMemo(() => [], [])

  const onWidgetsPresence = useCallback((info) => {
    setAttentionWidgets({
      hasPnk: Boolean(info?.hasPnk),
      hasPlanerka: Boolean(info?.hasPlanerka),
      sideCount: Number(info?.sideCount) || 0,
    })
  }, [])

  const planLevels = useMemo(
    () => ({
      level1: Number(planForm.plan_level_1) || 0,
      level2: Number(planForm.plan_level_2) || 0,
      level3: Number(planForm.plan_level_3) || 0,
    }),
    [planForm],
  )

  const planDirections = useMemo(() => computePlanDirectionsFromForm(planForm), [planForm])

  const planMatrix = useMemo(() => {
    const built = buildPlanMatrixJsonFromForm(planForm)
    return built.ok ? built.plan_matrix : {}
  }, [planForm])

  const shiftReportMonth = useCallback((delta) => {
    setReportDate((current) => {
      const parts = monthPartsFromIso(current)
      if (!parts) return current
      let { year, month } = parts
      month += delta
      while (month < 1) {
        month += 12
        year -= 1
      }
      while (month > 12) {
        month -= 12
        year += 1
      }
      const day = Math.min(Number(String(current).slice(8, 10)) || 1, new Date(year, month, 0).getDate())
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return clampIsoDateToToday(iso)
    })
  }, [])

  /** Месяц плана без clamp (нужен «следующий месяц» для ориентира ПЗ ДК). */
  const selectPlanCalendarMonth = useCallback((ym) => {
    const y = Number(ym?.year)
    const m = Number(ym?.month)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return
    const today = todayLocalIso()
    const cur = calendarYearMonthFromIso(today)
    if (cur && cur.year === y && cur.month === m) {
      setReportDate(today)
      return
    }
    setReportDate(`${y}-${String(m).padStart(2, '0')}-01`)
  }, [])

  const openDayReport = useCallback(
    (iso) => {
      setReportDate(clampIsoDateToToday(iso))
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (isSalesManager) next.set('tab', 'report')
          else next.delete('tab')
          return next
        },
        { replace: true },
      )
    },
    [isSalesManager, setSearchParams],
  )

  const handleSaveDaily = async () => {
    if (!clubId) return
    setSavingDaily(true)
    setError('')
    try {
      const row = await saveClubSalesDaily({
        clubId,
        reportDate,
        form: dailyForm,
        trainingsMatrixInput: trainingsMatrix,
        aerobicMatrixInput: aerobicMatrix,
        trainerIds: trainers.map((t) => t.id).filter(Boolean),
        membershipTypes,
        aerobicMembershipTypes,
      })
      if (!row) {
        setError('API продаж недоступен')
        return
      }
      setDailyForm(dailyRowToForm(row))
      setTrainingsMatrix(hydrateTrainingsMatrixInputMap(normalizeMatrixRowsFromDb(row?.trainings_matrix)))
      setAerobicMatrix(aerobicRowsToInputMap(normalizeAerobicRowsFromDb(row?.aerobic_sales_matrix)))
      clearSalesDraft(salesDailyDraftKey(clubId, reportDate))
      clearSalesPlanGlanceSession(clubId)
      invalidateSalesShellSession(clubId)
      await loadBundle()
      setVesselPulse((k) => k + 1)
      showToast('Отчёт сохранён')
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения')
    } finally {
      setSavingDaily(false)
    }
  }

  const handleSavePlanLevels = async () => {
    if (!clubId) return
    setSavingPlan(true)
    setError('')
    try {
      const plan = await saveClubSalesPlan({
        clubId,
        year: yearMonth.year,
        month: yearMonth.month,
        form: planForm,
        scope: 'levels',
      })
      if (!plan) {
        setError('API продаж недоступен')
        return
      }
      setPlanForm(planRowToForm(plan))
      clearSalesDraft(salesPlanDraftKey(clubId, yearMonth.year, yearMonth.month))
      clearSalesPlanGlanceSession(clubId)
      invalidateSalesShellSession(clubId)
      await loadBundle()
      showToast('Уровни плана сохранены')
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения уровней')
    } finally {
      setSavingPlan(false)
    }
  }

  const handleSavePlanDirections = async () => {
    if (!clubId) return
    setSavingPlan(true)
    setError('')
    try {
      const plan = await saveClubSalesPlan({
        clubId,
        year: yearMonth.year,
        month: yearMonth.month,
        form: planForm,
        scope: 'directions',
      })
      if (!plan) {
        setError('API продаж недоступен')
        return
      }
      setPlanForm(planRowToForm(plan))
      clearSalesDraft(salesPlanDraftKey(clubId, yearMonth.year, yearMonth.month))
      clearSalesPlanGlanceSession(clubId)
      invalidateSalesShellSession(clubId)
      await loadBundle()
      showToast('План по направлениям сохранён')
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения плана')
    } finally {
      setSavingPlan(false)
    }
  }

  const handleSaveFinance = async () => {
    if (!clubId) return
    setSavingFinance(true)
    setError('')
    setFinanceFeedback(null)
    try {
      const expense = await saveClubSalesFinance({
        clubId,
        year: yearMonth.year,
        month: yearMonth.month,
        form: expenseForm,
      })
      if (!expense) {
        const msg = 'API продаж недоступен'
        setError(msg)
        showFinanceFeedback(msg, 'err')
        return
      }
      setExpenseForm(expenseRowToForm(expense))
      clearSalesDraft(salesFinanceDraftKey(clubId, yearMonth.year, yearMonth.month))
      clearSalesPlanGlanceSession(clubId)
      invalidateSalesShellSession(clubId)
      await loadBundle()
      showFinanceFeedback('Расход сохранён')
    } catch (e) {
      const msg = e?.message ?? 'Ошибка сохранения расхода'
      setError(msg)
      showFinanceFeedback(msg, 'err')
    } finally {
      setSavingFinance(false)
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="card">
        <p>Облако не настроено — отчёты продаж доступны только с Supabase.</p>
      </div>
    )
  }

  if (!clubId) {
    if (isSalesManager && profilePending) {
      return (
        <div className="challenge-empty-card challenge-empty-card--inline">
          <TrendingUp className="challenge-empty-card__icon" size={40} aria-hidden />
          <div>
            <p className="challenge-empty-card__title">Загружаем клуб…</p>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Подождите несколько секунд или нажмите «Повторить».
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.75rem' }}
              onClick={() => void refreshUserProfile()}
            >
              Повторить
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="challenge-empty-card challenge-empty-card--inline">
        <TrendingUp className="challenge-empty-card__icon" size={40} aria-hidden />
        <div>
          <p className="challenge-empty-card__title">
            {isSalesManager ? 'Клуб не привязан к учётке' : 'Выберите клуб в шапке'}
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {isSalesManager
              ? 'Обратитесь к администратору — в профиле должен быть указан club_id.'
              : 'Отчёты продаж привязаны к одному клубу.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <SectionErrorBoundary section="admin_sales" title="Продажи и отчёты">
    <div
      className={`sales-report sales-report--wide${busy ? ' sales-report__busy' : ''}${isSalesManager ? ` sales-report--manager sales-home${salesTab === 'home' ? ' sales-home--fill' : ''}` : ''}`}
    >
      {showSalesHero && isSalesManager ? (
        <div className="sales-home__board">
          {clubId ? (
            <AdminHomeAttentionRow
              clubId={clubId}
              hrefPnk="/sales/pnk"
              hrefPlanerka="/sales/club-tasks"
              softSignals={softSignals}
              onWidgetsPresence={onWidgetsPresence}
              renderPlan={({ compact }) => (
                <div
                  className={`sales-report__hero sales-home__hero sales-home__attention-plan${compact ? ' sales-home__attention-plan--compact' : ''}`}
                >
                  <div className="sales-report__hero-head">
                    <div className="sales-home__hero-text">
                      <p className="sales-home__eyebrow">{monthLabel}</p>
                      <h1 className="sales-home__title">План продаж</h1>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-icon-square"
                      onClick={() => void loadBundle()}
                      disabled={busy}
                      aria-label="Обновить"
                      title="Обновить"
                      aria-busy={busy}
                    >
                      <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
                    </button>
                  </div>
                  <SalesPlanVessel fact={factMonth} planLevels={planLevels} pulseKey={vesselPulse} />
                </div>
              )}
            />
          ) : (
            <div className="sales-report__hero sales-home__hero">
              <div className="sales-report__hero-head">
                <div className="sales-home__hero-text">
                  <p className="sales-home__eyebrow">{monthLabel}</p>
                  <h1 className="sales-home__title">План продаж</h1>
                </div>
              </div>
            </div>
          )}

          {salesTab === 'home' ? (
            <SalesHomeTiles attentionWidgets={attentionWidgets} />
          ) : null}
        </div>
      ) : showSalesHero ? (
        <div className="sales-report__hero">
          <div className="sales-report__hero-head">
            <div>
              <h1 className="admin-path-head__title sales-report__page-title">Продажи</h1>
              <p className="admin-path-head__lead sales-report__month-label">{monthLabel}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-icon-square"
              onClick={() => void loadBundle()}
              disabled={busy}
              aria-label="Обновить"
              title="Обновить"
              aria-busy={busy}
            >
              <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
            </button>
          </div>
          <SalesPlanVessel fact={factMonth} planLevels={planLevels} pulseKey={vesselPulse} />
          {heroFinanceForecast?.ok ? (
            <AdminHomeSalesGlanceMetrics
              fact={heroFinanceForecast.fact}
              forecast={heroFinanceForecast.forecast}
            />
          ) : null}
        </div>
      ) : null}

      {isSalesManager && salesTab !== 'home' ? (
        <div className="sales-report__toolbar">
          <div className="sales-home__hero-text">
            <p className="sales-home__eyebrow">{monthLabel}</p>
            <h1 className="sales-page__title">
              {salesTab === 'report'
                ? 'Отчёт за день'
                : salesTab === 'analytics'
                  ? 'Аналитика'
                  : salesTab === 'price'
                    ? 'Прайс'
                    : salesTab === 'strategy'
                      ? 'Стратегия'
                      : salesTab === 'clips'
                        ? 'Заявка тренеру на абон'
                        : 'Статистика'}
            </h1>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon-square"
            onClick={() => void loadBundle()}
            disabled={busy}
            aria-label="Обновить"
            title="Обновить"
            aria-busy={busy}
          >
            <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      {loadHint ? (
        <p className="sync-feedback sync-feedback--warn" role="status">
          {loadHint}
        </p>
      ) : null}

      {showInternalTabs ? (
        <div className="tabs sales-report__tabs" role="tablist" aria-label="Разделы продаж">
          <button
            type="button"
            className="tab"
            role="tab"
            id="sales-tab-daily"
            aria-selected={salesTab === 'daily'}
            aria-controls="sales-panel-daily"
            onClick={() => setSalesTab('daily')}
          >
            Отчёт за день
          </button>
          <button
            type="button"
            className="tab"
            role="tab"
            id="sales-tab-stats"
            aria-selected={salesTab === 'stats'}
            aria-controls="sales-panel-stats"
            onClick={() => setSalesTab('stats')}
          >
            Статистика
          </button>
          {showFinanceTab ? (
            <button
              type="button"
              className="tab"
              role="tab"
              id="sales-tab-finance"
              aria-selected={salesTab === 'finance'}
              aria-controls="sales-panel-finance"
              onClick={() => setSalesTab('finance')}
            >
              Финансы клуба
            </button>
          ) : null}
          <button
            type="button"
            className="tab tab--sales-planning sales-report__tab--push-end"
            role="tab"
            id="sales-tab-clips"
            aria-selected={salesTab === 'clips'}
            aria-controls="sales-panel-clips-admin"
            onClick={() => setSalesTab('clips')}
          >
            Заявка тренеру
          </button>
          {showFinanceTab ? (
            <>
              <button
                type="button"
                className="tab tab--sales-planning"
                role="tab"
                id="sales-tab-strategy"
                aria-selected={salesTab === 'strategy'}
                aria-controls="sales-panel-strategy"
                onClick={() => setSalesTab('strategy')}
              >
                Стратегия
              </button>
              <button
                type="button"
                className="tab tab--sales-planning"
                role="tab"
                id="sales-tab-plan"
                aria-selected={salesTab === 'plan'}
                aria-controls="sales-panel-plan"
                onClick={() => setSalesTab('plan')}
              >
                План месяца
              </button>
              <button
                type="button"
                className="tab tab--sales-planning"
                role="tab"
                id="sales-tab-price"
                aria-selected={salesTab === 'price'}
                aria-controls="sales-panel-price"
                onClick={() => setSalesTab('price')}
              >
                Прайс
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {isSalesManager && keepStrategyPanel ? (
        <div
          id="sales-panel-strategy"
          className="sales-report__panel"
          hidden={salesTab !== 'strategy'}
          aria-hidden={salesTab !== 'strategy'}
        >
          <SalesStrategyPanel
            clubId={clubId}
            membershipTypes={membershipTypes}
            clubPlanForm={planForm}
            clubPlanYear={yearMonth.year}
            clubPlanMonth={yearMonth.month}
            onPlanChange={setPlanForm}
            onSelectPlanMonth={selectPlanCalendarMonth}
            onToast={showToast}
          />
        </div>
      ) : null}

      {isSalesManager && salesTab === 'clips' ? (
        <div id="sales-panel-clips" className="sales-report__panel grid" style={{ gap: 18 }}>
          <SalesClipCreateSection
            clubId={clubId}
            trainers={trainers}
            membershipTypes={membershipTypes}
            reportDate={reportDate}
            onReportDateChange={(iso) => setReportDate(clampIsoDateToToday(iso))}
            canOpenAdminClient={false}
          />
        </div>
      ) : null}

      {isSalesManager && salesTab === 'report' ? (
        <div id="sales-panel-report" className="sales-report__panel">
          {clubId ? (
            <div className="sales-daily-excel-row">
              <SalesDailyPaymentsImportSection
                clubId={clubId}
                reportDate={reportDate}
                canEdit
                onApplyForm={setDailyForm}
                onToast={showToast}
                onReportDateHint={(iso) => setReportDate(clampIsoDateToToday(iso))}
              />
              <SalesDailyPzTrainingsImportSection
                clubId={clubId}
                reportDate={reportDate}
                trainers={trainers}
                membershipTypes={membershipTypes}
                canEdit
                onApplyMatrix={setTrainingsMatrix}
                onToast={showToast}
              />
            </div>
          ) : null}
          <SalesDailyForm
            reportDate={reportDate}
            dateLabel={formatDateRu(reportDate)}
            form={dailyForm}
            onFormChange={setDailyForm}
            onPrevDay={() => setReportDate((d) => addDaysToIso(d, -1))}
            onNextDay={() => setReportDate((d) => clampIsoDateToToday(addDaysToIso(d, 1)))}
            onDateChange={(iso) => setReportDate(clampIsoDateToToday(iso))}
            onSave={() => void handleSaveDaily()}
            saving={savingDaily}
            canEdit
            trainers={trainers}
            membershipTypes={membershipTypes}
            membershipTypeColumns={membershipTypeColumns}
            trainingsMatrix={trainingsMatrix}
            onTrainingsMatrixChange={setTrainingsMatrix}
            aerobicMatrix={aerobicMatrix}
            onAerobicMatrixChange={setAerobicMatrix}
            aerobicMembershipTypes={aerobicMembershipTypes}
            aerobicTypeColumns={aerobicTypeColumns}
            fitCityTypeStats={fitCityTypeStats}
            clubId={clubId}
            showPayroll={!isSalesManager}
          />
        </div>
      ) : null}

      {isSalesManager && salesTab === 'analytics' ? (
        <div id="sales-panel-analytics" className="sales-report__panel">
          <SalesManagerAnalyticsPanel
            year={yearMonth.year}
            month={yearMonth.month}
            monthRows={monthDays}
            membershipTypes={membershipTypes}
            planForm={planForm}
          />
        </div>
      ) : null}

      {isSalesManager && salesTab === 'stats' ? (
        <div id="sales-panel-stats" className="sales-report__panel">
          <SalesManagerStatsPanel
            monthLabel={monthLabel}
            year={yearMonth.year}
            month={yearMonth.month}
            monthRows={monthDays}
            planLevels={planLevels}
            planDirections={planDirections}
            planMatrix={planMatrix}
            membershipTypes={membershipTypes}
            trainers={trainers}
            onPrevMonth={() => shiftReportMonth(-1)}
            onNextMonth={() => shiftReportMonth(1)}
            onOpenDay={openDayReport}
            showPayroll={false}
          />
        </div>
      ) : null}

      {!isSalesManager && salesTab === 'clips' ? (
        <div id="sales-panel-clips-admin" role="tabpanel" aria-labelledby="sales-tab-clips" className="grid" style={{ gap: 18 }}>
          <SalesClipCreateSection
            clubId={clubId}
            trainers={trainers}
            membershipTypes={membershipTypes}
            reportDate={reportDate}
            onReportDateChange={(iso) => setReportDate(clampIsoDateToToday(iso))}
            canOpenAdminClient
          />
        </div>
      ) : null}

      {!isSalesManager && keepStrategyPanel ? (
        <div
          id="sales-panel-strategy"
          role="tabpanel"
          aria-labelledby="sales-tab-strategy"
          hidden={salesTab !== 'strategy'}
          aria-hidden={salesTab !== 'strategy'}
        >
          <SalesStrategyPanel
            clubId={clubId}
            membershipTypes={membershipTypes}
            clubPlanForm={planForm}
            clubPlanYear={yearMonth.year}
            clubPlanMonth={yearMonth.month}
            onPlanChange={setPlanForm}
            onSelectPlanMonth={selectPlanCalendarMonth}
            onToast={showToast}
            showAdminFinanceBar
          />
        </div>
      ) : null}

      {!isSalesManager && salesTab === 'daily' ? (
        <div id="sales-panel-daily" role="tabpanel" aria-labelledby="sales-tab-daily">
          {clubId ? <SalesDailyTaskAssign clubId={clubId} reportDate={reportDate} /> : null}
          {clubId ? (
            <div className="sales-daily-excel-row">
              <SalesDailyPaymentsImportSection
                clubId={clubId}
                reportDate={reportDate}
                canEdit
                onApplyForm={setDailyForm}
                onToast={showToast}
                onReportDateHint={(iso) => setReportDate(clampIsoDateToToday(iso))}
              />
              <SalesDailyPzTrainingsImportSection
                clubId={clubId}
                reportDate={reportDate}
                trainers={trainers}
                membershipTypes={membershipTypes}
                canEdit
                onApplyMatrix={setTrainingsMatrix}
                onToast={showToast}
              />
            </div>
          ) : null}
          <SalesDailyForm
            reportDate={reportDate}
            dateLabel={formatDateRu(reportDate)}
            form={dailyForm}
            onFormChange={setDailyForm}
            onPrevDay={() => setReportDate((d) => addDaysToIso(d, -1))}
            onNextDay={() => setReportDate((d) => clampIsoDateToToday(addDaysToIso(d, 1)))}
            onDateChange={(iso) => setReportDate(clampIsoDateToToday(iso))}
            onSave={() => void handleSaveDaily()}
            saving={savingDaily}
            canEdit
            trainers={trainers}
            membershipTypes={membershipTypes}
            membershipTypeColumns={membershipTypeColumns}
            trainingsMatrix={trainingsMatrix}
            onTrainingsMatrixChange={setTrainingsMatrix}
            aerobicMatrix={aerobicMatrix}
            onAerobicMatrixChange={setAerobicMatrix}
            aerobicMembershipTypes={aerobicMembershipTypes}
            aerobicTypeColumns={aerobicTypeColumns}
            fitCityTypeStats={fitCityTypeStats}
            clubId={clubId}
            showPayroll
          />
        </div>
      ) : !isSalesManager && salesTab === 'stats' ? (
        <div id="sales-panel-stats" role="tabpanel" aria-labelledby="sales-tab-stats">
          <SalesManagerStatsPanel
            monthLabel={monthLabel}
            year={yearMonth.year}
            month={yearMonth.month}
            monthRows={monthDays}
            planLevels={planLevels}
            planDirections={planDirections}
            planMatrix={planMatrix}
            membershipTypes={membershipTypes}
            trainers={trainers}
            onPrevMonth={() => shiftReportMonth(-1)}
            onNextMonth={() => shiftReportMonth(1)}
            onOpenDay={openDayReport}
            showPayroll
          />
        </div>
      ) : !isSalesManager && salesTab === 'plan' ? (
        <div id="sales-panel-plan" role="tabpanel" aria-labelledby="sales-tab-plan">
          <SalesPlanSettingsPanel
            monthLabel={monthLabel}
            planForm={planForm}
            onPlanChange={setPlanForm}
            expenseForm={expenseForm}
            onExpenseChange={setExpenseForm}
            onSavePlan={() => void handleSavePlanLevels()}
            onSavePlanDirections={() => void handleSavePlanDirections()}
            onSaveFinance={() => void handleSaveFinance()}
            savingPlan={savingPlan}
            savingFinance={savingFinance}
            financeFeedback={financeFeedback}
          />
        </div>
      ) : !isSalesManager && salesTab === 'finance' ? (
        <div id="sales-panel-finance" role="tabpanel" aria-labelledby="sales-tab-finance">
          <SalesFinancePanel
            monthLabel={monthLabel}
            planForm={planForm}
            monthSummary={monthSummary}
            year={yearMonth.year}
            month={yearMonth.month}
            monthRows={monthDays}
            membershipTypes={membershipTypes}
          />
        </div>
      ) : salesTab === 'price' ? (
        <div id="sales-panel-price" role="tabpanel" aria-labelledby="sales-tab-price">
          <SectionErrorBoundary title="Прайс">
            <PriceListHallShell clubId={clubId} membershipTypes={membershipTypes} />
          </SectionErrorBoundary>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`sales-report__toast sales-report__toast--${toast.tone === 'err' ? 'err' : toast.tone === 'warn' ? 'warn' : 'ok'}`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      ) : null}
    </div>
    </SectionErrorBoundary>
  )
}
