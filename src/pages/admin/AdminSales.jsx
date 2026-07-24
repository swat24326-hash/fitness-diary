import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarDays, ClipboardList, RefreshCw, TrendingUp, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { addDaysToIso, clampIsoDateToToday, formatDateRu, todayLocalIso } from '../../lib/dateRu'
import {
  dailyRowToForm,
  emptyDailyForm,
  emptyExpenseForm,
  emptyPlanForm,
  expenseRowToForm,
  planRowToForm,
  monthPartsFromIso,
  resolvePlanFactFromMonthSummary,
} from '../../lib/admin/salesReportCore'
import { computePlanDirectionsFromForm, buildPlanMatrixJsonFromForm } from '../../lib/admin/salesPlanMatrixCore'
import {
  buildTrainingsMatrixColumns,
  clubAggregateInputMap,
  matrixRowsToInputMap,
  normalizeMatrixRowsFromDb,
  SALES_TRAINING_CLUB_ID,
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
import { SalesDailyForm } from '../../components/SalesDailyForm'
import { SalesDailyTaskAssign } from '../../components/sales/SalesDailyTaskAssign.jsx'
import { SalesFinancePanel } from '../../components/SalesFinancePanel'
import { SalesPlanSettingsPanel } from '../../components/SalesPlanSettingsPanel'
import { SalesManagerStatsPanel } from '../../components/SalesManagerStatsPanel'
import { SalesManagerAnalyticsPanel } from '../../components/SalesManagerAnalyticsPanel'
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary'
import { AdminHomeAttentionRow } from '../../components/admin/AdminHomeAttentionRow'
import '../../styles/sales-report.css'

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
  const { user, profilePending, refreshUserProfile } = useAuth()
  const ctx = useOutletContext()
  const clubIdCtx = ctx?.clubId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const clubId = isSalesManager
    ? String(user?.club_id ?? '').trim()
    : searchParams.get('club') ?? clubIdCtx ?? ''
  const salesTabParam = searchParams.get('tab')
  const salesTab = useMemo(() => {
    if (isSalesManager) {
      if (salesTabParam === 'stats') return 'stats'
      if (salesTabParam === 'report') return 'report'
      if (salesTabParam === 'analytics') return 'analytics'
      return 'home'
    }
    if (salesTabParam === 'finance') return 'finance'
    if (salesTabParam === 'plan') return 'plan'
    if (salesTabParam === 'stats') return 'stats'
    return 'daily'
  }, [isSalesManager, salesTabParam])
  const showSalesHero = !isSalesManager || salesTab === 'home'
  const showFinanceTab = !isSalesManager
  const showInternalTabs = !isSalesManager

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
    setToast({ text, tone })
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [])

  const loadBundle = useCallback(async () => {
    if (!clubId || !isSupabaseConfigured()) return
    setBusy(true)
    setError('')
    setLoadHint('')
    try {
      const cachedTypes = await listMembershipTypesForClub(clubId)
      if (cachedTypes.length) setMembershipTypes(cachedTypes)

      const typesPromise = ensureMembershipTypesForClub(clubId, { force: !cachedTypes.length })
      const bundle = await fetchClubSalesBundle({ clubId, reportDate })
      const ensured = await typesPromise
      const cid = clubId
      const date = reportDate

      setMonthSummary(bundle.monthSummary)
      setMonthDays(bundle.monthDays ?? [])
      setYearMonth({ year: bundle.year, month: bundle.month })

      const types =
        (bundle.membershipTypes?.length ? bundle.membershipTypes : null) ??
        ensured.types ??
        []
      setMembershipTypes(types)
      setTrainers(bundle.trainers ?? [])
      setFitCityTypeStats(bundle.fitCityTypeStats ?? null)

      const cols = buildTrainingsMatrixColumns(types)
      const matrixRows = normalizeMatrixRowsFromDb(bundle.daily?.trainings_matrix)
      let nextDailyForm = dailyRowToForm(bundle.daily)
      let nextTrainingsMatrix = clubAggregateInputMap(
        matrixRowsToInputMap(matrixRows),
        (bundle.trainers ?? []).map((t) => t.id),
        cols,
      )
      let nextAerobicMatrix = aerobicRowsToInputMap(normalizeAerobicRowsFromDb(bundle.daily?.aerobic_sales_matrix))
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
      nextDailyForm = dailyResolved.dailyForm
      nextTrainingsMatrix = dailyResolved.trainingsMatrix
      nextAerobicMatrix = dailyResolved.aerobicMatrix

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

      setDailyForm(nextDailyForm)
      setPlanForm(nextPlanForm)
      setExpenseForm(nextExpenseForm)
      setTrainingsMatrix(nextTrainingsMatrix)
      setAerobicMatrix(nextAerobicMatrix)

      const draftHints = []
      if (dailyResolved.restored) draftHints.push('дневной отчёт')
      if (planResolved.restored) draftHints.push('план')
      if (expenseResolved.restored) draftHints.push('расход')
      if (draftHints.length) {
        setLoadHint(`Восстановлен несохранённый черновик: ${draftHints.join(', ')}.`)
      }

      if (bundle.warnings?.length) {
        setLoadHint((prev) =>
          [prev, bundle.warnings.filter(Boolean).join(' ')].filter(Boolean).join(' '),
        )
      }
    } catch (e) {
      const ensured = await ensureMembershipTypesForClub(clubId, { force: true }).catch(() => ({ types: [] }))
      if (ensured.types?.length) {
        setMembershipTypes(ensured.types)
      } else {
        const cached = await listMembershipTypesForClub(clubId)
        if (cached.length) setMembershipTypes(cached)
      }
      setError(humanizeNetworkError(e) || e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }, [clubId, reportDate])

  useEffect(() => {
    void loadBundle()
  }, [loadBundle])

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
        trainerIds: [SALES_TRAINING_CLUB_ID],
        membershipTypes,
        aerobicMembershipTypes,
      })
      if (!row) {
        setError('API продаж недоступен')
        return
      }
      setDailyForm(dailyRowToForm(row))
      const cols = buildTrainingsMatrixColumns(membershipTypes)
      setTrainingsMatrix(
        clubAggregateInputMap(
          matrixRowsToInputMap(normalizeMatrixRowsFromDb(row?.trainings_matrix)),
          trainers.map((t) => t.id),
          cols,
        ),
      )
      setAerobicMatrix(aerobicRowsToInputMap(normalizeAerobicRowsFromDb(row?.aerobic_sales_matrix)))
      clearSalesDraft(salesDailyDraftKey(clubId, reportDate))
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
    try {
      const expense = await saveClubSalesFinance({
        clubId,
        year: yearMonth.year,
        month: yearMonth.month,
        form: expenseForm,
      })
      if (!expense) {
        setError('API продаж недоступен')
        return
      }
      setExpenseForm(expenseRowToForm(expense))
      clearSalesDraft(salesFinanceDraftKey(clubId, yearMonth.year, yearMonth.month))
      await loadBundle()
      showToast('Расход сохранён')
    } catch (e) {
      setError(e?.message ?? 'Ошибка сохранения расхода')
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
            <section className="sales-home__tiles" aria-labelledby="sales-home-sections">
              <h2 id="sales-home-sections" className="sales-home__tiles-heading">
                Разделы
              </h2>
              <div className="sales-home__tile-grid">
                <Link
                  to="/sales/pnk"
                  className={`sales-home__tile sales-home__tile--pnk u-no-decoration${attentionWidgets.hasPnk ? ' sales-home__tile--echo' : ''}`}
                  title={attentionWidgets.hasPnk ? 'ПНК уже на главной выше' : undefined}
                >
                  <div className="sales-home__tile-icon">
                    <UserRound size={44} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">ПНК</p>
                </Link>
                <Link to="/sales?tab=report" className="sales-home__tile u-no-decoration">
                  <div className="sales-home__tile-icon">
                    <CalendarDays size={44} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">Отчёт</p>
                </Link>
                <Link to="/sales?tab=stats" className="sales-home__tile u-no-decoration">
                  <div className="sales-home__tile-icon">
                    <BarChart3 size={44} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">Статистика</p>
                </Link>
                <Link to="/sales?tab=analytics" className="sales-home__tile u-no-decoration">
                  <div className="sales-home__tile-icon">
                    <TrendingUp size={44} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">Аналитика</p>
                </Link>
                <Link
                  to="/sales/club-tasks"
                  className={`sales-home__tile u-no-decoration${attentionWidgets.hasPlanerka ? ' sales-home__tile--echo' : ''}`}
                  title={attentionWidgets.hasPlanerka ? 'Планёрка уже на главной выше' : undefined}
                >
                  <div className="sales-home__tile-icon">
                    <ClipboardList size={44} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">Планёрка</p>
                </Link>
              </div>
            </section>
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
        </div>
      ) : null}

      {isSalesManager && salesTab !== 'home' ? (
        <div className="sales-report__toolbar">
          <div className="sales-home__hero-text">
            <p className="sales-home__eyebrow">{monthLabel}</p>
            <h1 className="sales-page__title">
              {salesTab === 'report' ? 'Отчёт за день' : salesTab === 'analytics' ? 'Аналитика' : 'Статистика'}
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
            <>
              <button
                type="button"
                className="tab"
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
                className="tab"
                role="tab"
                id="sales-tab-finance"
                aria-selected={salesTab === 'finance'}
                aria-controls="sales-panel-finance"
                onClick={() => setSalesTab('finance')}
              >
                Финансы клуба
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {isSalesManager && salesTab === 'report' ? (
        <div id="sales-panel-report" className="sales-report__panel">
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

      {!isSalesManager && salesTab === 'daily' ? (
        <div id="sales-panel-daily" role="tabpanel" aria-labelledby="sales-tab-daily">
          {clubId ? <SalesDailyTaskAssign clubId={clubId} reportDate={reportDate} /> : null}
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
      ) : null}

      {toast ? (
        <div
          className={`sync-feedback sync-feedback--${toast.tone} sales-report__toast`}
          role="status"
        >
          {toast.text}
        </div>
      ) : null}
    </div>
    </SectionErrorBoundary>
  )
}
