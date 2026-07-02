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
  const [search] = useSearchParams()
  const clubId = search.get('club') ?? clubIdCtx ?? ''

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
  const [vesselPulse, setVesselPulse] = useState(0)
  const [toast, setToast] = useState(null)
  const [yearMonth, setYearMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })

  const showToast = useCallback((text, tone = 'ok') => {
    setToast({ text, tone })
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [])

  const loadBundle = useCallback(async () => {
    if (!clubId || !isSupabaseConfigured()) return
    setBusy(true)
    setError('')
    try {
      const bundle = await fetchClubSalesBundle({ clubId, reportDate })
      if (!bundle) {
        setError('API продаж недоступен — обновите деплой')
        return
      }
      setDailyForm(dailyRowToForm(bundle.daily))
      setPlanForm(planRowToForm(bundle.plan))
      setExpenseForm(expenseRowToForm(bundle.expense))
      setMonthSummary(bundle.monthSummary)
      setPlanTotal(Number(bundle.plan?.plan_total) || 0)
      setYearMonth({ year: bundle.year, month: bundle.month })
    } catch (e) {
      setError(e?.message ?? 'Ошибка загрузки')
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
      const row = await saveClubSalesDaily({ clubId, reportDate, form: dailyForm })
      if (!row) {
        setError('API продаж недоступен')
        return
      }
      setDailyForm(dailyRowToForm(row))
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
      />

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
