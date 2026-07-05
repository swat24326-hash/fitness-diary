import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { addDaysToIso, clampIsoDateToToday, formatDateRu, todayLocalIso } from '../../lib/dateRu'
import {
  dailyRowToForm,
  emptyDailyForm,
  emptyExpenseForm,
  emptyPlanForm,
  expenseRowToForm,
  planRowToForm,
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

export function AdminSales() {
  const ctx = useOutletContext()
  const clubIdCtx = ctx?.clubId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const clubId = searchParams.get('club') ?? clubIdCtx ?? ''
  const salesTab = searchParams.get('tab') === 'finance' ? 'finance' : 'daily'

  const setSalesTab = (tab) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'finance') next.set('tab', 'finance')
    else next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  const [reportDate, setReportDate] = useState(() => todayLocalIso())
  const [dailyForm, setDailyForm] = useState(emptyDailyForm)
  const [planForm, setPlanForm] = useState(emptyPlanForm)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [monthSummary, setMonthSummary] = useState(null)
  const [planTotal, setPlanTotal] = useState(0)
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
      setPlanTotal(Number(bundle.plan?.plan_total) || 0)
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

      if (bundle.source === 'supabase') {
        setLoadHint('Данные через Supabase (сервер /api недоступен).')
      }
      if (bundle.warnings?.length) {
        setLoadHint((prev) => [prev, ...bundle.warnings].filter(Boolean).join(' '))
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

  const handleSavePlan = async () => {
    if (!clubId) return
    setSavingPlan(true)
    setError('')
    try {
      const plan = await saveClubSalesPlan({
        clubId,
        year: yearMonth.year,
        month: yearMonth.month,
        form: planForm,
      })
      if (!plan) {
        setError('API продаж недоступен')
        return
      }
      setPlanForm(planRowToForm(plan))
      setPlanTotal(Number(plan.plan_total) || 0)
      await loadBundle()
      showToast('План сохранён')
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
          <p className="challenge-empty-card__title">Выберите клуб в шапке</p>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Отчёты продаж привязаны к одному клубу.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`sales-report${busy ? ' sales-report__busy' : ''}`}>
      <div className="sales-report__hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div>
            <h1 className="section-title" style={{ margin: 0 }}>
              Продажи
            </h1>
            <p className="sales-report__month-label muted">{monthLabel}</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadBundle()} disabled={busy}>
            <RefreshCw size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            Обновить
          </button>
        </div>
        <SalesPlanVessel fact={factMonth} planTotal={planTotal} pulseKey={vesselPulse} />
      </div>

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
          id="sales-tab-finance"
          aria-selected={salesTab === 'finance'}
          aria-controls="sales-panel-finance"
          onClick={() => setSalesTab('finance')}
        >
          Финансы клуба
        </button>
      </div>

      {salesTab === 'daily' ? (
        <div id="sales-panel-daily" role="tabpanel" aria-labelledby="sales-tab-daily">
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
      ) : (
        <div id="sales-panel-finance" role="tabpanel" aria-labelledby="sales-tab-finance">
          <SalesFinancePanel
            monthLabel={monthLabel}
            planForm={planForm}
            onPlanChange={setPlanForm}
            expenseForm={expenseForm}
            onExpenseChange={setExpenseForm}
            monthSummary={monthSummary}
            onSavePlan={() => void handleSavePlan()}
            onSaveFinance={() => void handleSaveFinance()}
            savingPlan={savingPlan}
            savingFinance={savingFinance}
          />
        </div>
      )}

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
