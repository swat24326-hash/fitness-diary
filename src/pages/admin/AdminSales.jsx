import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarDays, RefreshCw, TrendingUp } from 'lucide-react'
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
} from '../../lib/admin/salesReportCore'
import {
  buildTrainingsMatrixColumns,
  clubAggregateInputMap,
  matrixRowsToInputMap,
  normalizeMatrixRowsFromDb,
  SALES_TRAINING_CLUB_ID,
} from '../../lib/admin/salesTrainingsMatrix'
import { ensureMembershipTypesForClub, listMembershipTypesForClub } from '../../lib/membershipTypesService'
import { humanizeNetworkError } from '../../lib/supabaseRetry'
import {
  fetchClubSalesBundle,
  saveClubSalesDaily,
  saveClubSalesFinance,
  saveClubSalesPlan,
} from '../../lib/admin/adminSalesService'
import { SalesPlanVessel } from '../../components/SalesPlanVessel'
import { SalesDailyForm } from '../../components/SalesDailyForm'
import { SalesFinancePanel } from '../../components/SalesFinancePanel'
import { SalesPlanDirectionsForm } from '../../components/SalesPlanDirectionsForm'
import { SalesManagerStatsPanel } from '../../components/SalesManagerStatsPanel'
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
  const { user } = useAuth()
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
      return 'home'
    }
    if (salesTabParam === 'finance') return 'finance'
    if (salesTabParam === 'stats') return 'stats'
    return 'daily'
  }, [isSalesManager, salesTabParam])
  const showSalesHero = !isSalesManager || salesTab === 'home'
  const showFinanceTab = !isSalesManager
  const showInternalTabs = !isSalesManager

  useEffect(() => {
    if (isSalesManager && salesTabParam === 'finance') {
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

  const membershipTypeColumns = useMemo(
    () => buildTrainingsMatrixColumns(membershipTypes),
    [membershipTypes],
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

      setDailyForm(dailyRowToForm(bundle.daily))
      setPlanForm(planRowToForm(bundle.plan))
      setExpenseForm(expenseRowToForm(bundle.expense))
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
      setTrainingsMatrix(
        clubAggregateInputMap(
          matrixRowsToInputMap(matrixRows),
          (bundle.trainers ?? []).map((t) => t.id),
          cols,
        ),
      )

      if (bundle.warnings?.length) {
        setLoadHint(bundle.warnings.filter(Boolean).join(' '))
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

  const monthLabel = useMemo(() => {
    const name = MONTH_NAMES[(yearMonth.month || 1) - 1] ?? ''
    return `${name} ${yearMonth.year}`
  }, [yearMonth])

  const factMonth = Number(monthSummary?.profitTotal) || 0

  const planLevels = useMemo(
    () => ({
      level1: Number(planForm.plan_level_1) || 0,
      level2: Number(planForm.plan_level_2) || 0,
      level3: Number(planForm.plan_level_3) || 0,
    }),
    [planForm],
  )

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
        trainerIds: [SALES_TRAINING_CLUB_ID],
        membershipTypes,
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
    <div
      className={`sales-report${busy ? ' sales-report__busy' : ''}${isSalesManager ? ' sales-report--manager sales-home' : ''}`}
    >
      {showSalesHero && isSalesManager ? (
        <div className="sales-home__board">
          <div className="sales-report__hero sales-home__hero">
            <div className="sales-report__hero-head">
              <div className="sales-home__hero-text">
                <p className="sales-home__eyebrow">{monthLabel}</p>
                <h1 className="sales-home__title">План продаж</h1>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadBundle()} disabled={busy}>
                <RefreshCw size={16} aria-hidden className="sales-report__btn-icon" />
                Обновить
              </button>
            </div>
            <SalesPlanVessel fact={factMonth} planLevels={planLevels} pulseKey={vesselPulse} />
          </div>

          {salesTab === 'home' ? (
            <section className="sales-home__tiles" aria-labelledby="sales-home-sections">
              <h2 id="sales-home-sections" className="sales-home__tiles-heading">
                Разделы
              </h2>
              <div className="sales-home__tile-grid">
                <Link to="/sales?tab=report" className="sales-home__tile u-no-decoration">
                  <div className="sales-home__tile-icon">
                    <CalendarDays size={32} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">Отчёт</p>
                </Link>
                <Link to="/sales?tab=stats" className="sales-home__tile u-no-decoration">
                  <div className="sales-home__tile-icon">
                    <BarChart3 size={32} aria-hidden />
                  </div>
                  <p className="sales-home__tile-title">Статистика</p>
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      ) : showSalesHero ? (
        <div className="sales-report__hero">
          <div className="sales-report__hero-head">
            <div>
              <h1 className="section-title sales-report__page-title">Продажи</h1>
              <p className="sales-report__month-label muted">{monthLabel}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadBundle()} disabled={busy}>
              <RefreshCw size={16} aria-hidden className="sales-report__btn-icon" />
              Обновить
            </button>
          </div>
          <SalesPlanVessel fact={factMonth} planLevels={planLevels} pulseKey={vesselPulse} />
        </div>
      ) : null}

      {isSalesManager && salesTab !== 'home' ? (
        <div className="sales-report__toolbar">
          <div className="sales-home__hero-text">
            <p className="sales-home__eyebrow">{monthLabel}</p>
            <h1 className="sales-page__title">{salesTab === 'report' ? 'Отчёт за день' : 'Статистика'}</h1>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadBundle()} disabled={busy}>
            <RefreshCw size={16} aria-hidden className="sales-report__btn-icon" />
            Обновить
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
            fitCityTypeStats={fitCityTypeStats}
            clubId={clubId}
          />
        </div>
      ) : null}

      {isSalesManager && salesTab === 'stats' ? (
        <div id="sales-panel-stats" className="sales-report__panel">
          <SalesPlanDirectionsForm
            planForm={planForm}
            onPlanChange={setPlanForm}
            onSave={() => void handleSavePlanDirections()}
            saving={savingPlan}
          />
          <SalesManagerStatsPanel
            monthLabel={monthLabel}
            year={yearMonth.year}
            month={yearMonth.month}
            monthRows={monthDays}
            planLevels={planLevels}
            membershipTypes={membershipTypes}
            trainers={trainers}
            onPrevMonth={() => shiftReportMonth(-1)}
            onNextMonth={() => shiftReportMonth(1)}
            onOpenDay={openDayReport}
          />
        </div>
      ) : null}

      {!isSalesManager && salesTab === 'daily' ? (
        <div id="sales-panel-daily" role="tabpanel" aria-labelledby="sales-tab-daily">
          <SalesPlanDirectionsForm
            planForm={planForm}
            onPlanChange={setPlanForm}
            onSave={() => void handleSavePlanDirections()}
            saving={savingPlan}
          />
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
            fitCityTypeStats={fitCityTypeStats}
            clubId={clubId}
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
            membershipTypes={membershipTypes}
            trainers={trainers}
            onPrevMonth={() => shiftReportMonth(-1)}
            onNextMonth={() => shiftReportMonth(1)}
            onOpenDay={openDayReport}
          />
        </div>
      ) : !isSalesManager ? (
        <div id="sales-panel-finance" role="tabpanel" aria-labelledby="sales-tab-finance">
          <SalesFinancePanel
            monthLabel={monthLabel}
            planForm={planForm}
            onPlanChange={setPlanForm}
            expenseForm={expenseForm}
            onExpenseChange={setExpenseForm}
            monthSummary={monthSummary}
            onSavePlan={() => void handleSavePlanLevels()}
            onSaveFinance={() => void handleSaveFinance()}
            savingPlan={savingPlan}
            savingFinance={savingFinance}
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
  )
}
