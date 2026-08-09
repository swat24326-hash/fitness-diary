import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { SalesPlanVessel } from '../SalesPlanVessel.jsx'
import { AdminHomeSalesGlanceMetrics } from './AdminHomeSalesGlanceMetrics.jsx'
import { fetchClubSalesBundle } from '../../lib/admin/adminSalesService.js'
import {
  expenseRowToForm,
  monthPartsFromIso,
  parseSalesMoney,
  planRowToForm,
  resolvePlanFactFromMonthSummary,
} from '../../lib/admin/salesReportCore.js'
import { buildClubFinanceForecast } from '../../lib/admin/clubFinanceForecastCore.js'
import { loadTrainerPayrollContextClient } from '../../lib/admin/trainerPayrollContextClient.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { buildAdminClubQueryHref } from '../../lib/admin/adminClientQuickFilters.js'
import {
  isSalesPlanGlanceFresh,
  peekSalesPlanGlanceSession,
  readSalesPlanGlanceSession,
  salesPlanGlanceLooksSame,
  writeSalesPlanGlanceSession,
} from '../../lib/admin/salesPlanGlanceSession.js'
import { useStaleWhileRevalidate } from '../../hooks/useStaleWhileRevalidate.js'
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

async function fetchSalesPlanGlancePayload(clubId) {
  const reportDate = todayLocalIso()
  const bundle = await fetchClubSalesBundle({ clubId, reportDate })
  const parts = monthPartsFromIso(reportDate)
  const name = parts ? MONTH_NAMES[(parts.month || 1) - 1] ?? '' : ''
  const form = planRowToForm(bundle.plan)
  const levels = {
    level1: Number(form.plan_level_1) || 0,
    level2: Number(form.plan_level_2) || 0,
    level3: Number(form.plan_level_3) || 0,
  }
  const expenseForm = expenseRowToForm(bundle.expense)
  const expenseRaw = parseSalesMoney(expenseForm.expense_month)
  const payrollCtx = await loadTrainerPayrollContextClient(clubId, {
    year: Number(bundle.year) || parts?.year,
    month: Number(bundle.month) || parts?.month,
  })
  const payTypes =
    payrollCtx.frozen && Array.isArray(payrollCtx.membershipTypes) && payrollCtx.membershipTypes.length
      ? payrollCtx.membershipTypes
      : Array.isArray(bundle.membershipTypes)
        ? bundle.membershipTypes
        : []
  return {
    monthLabel: parts ? `${name} ${parts.year}` : '',
    fact: resolvePlanFactFromMonthSummary(bundle.monthSummary),
    planLevels: levels,
    forecastBundle: {
      year: Number(bundle.year) || parts?.year || 0,
      month: Number(bundle.month) || parts?.month || 0,
      monthRows: Array.isArray(bundle.monthDays) ? bundle.monthDays : [],
      membershipTypes: payTypes,
      planForm: form,
      expense: Number.isFinite(expenseRaw) ? expenseRaw : 0,
      planConfig: payrollCtx.planConfig,
      profilesByTrainerId: payrollCtx.profilesByTrainerId,
      clubId,
    },
  }
}

/**
 * Факт / план месяца на главной админа — SWR: last-good сразу, без скелетона при кэше.
 * @param {{ clubId: string, compact?: boolean }} props
 */
export function AdminHomeSalesPlanGlance({ clubId = '', compact = false }) {
  const cid = String(clubId || '').trim()
  const reportDate = todayLocalIso()

  const salesHref = useMemo(
    () => buildAdminClubQueryHref('/admin/sales', { clubId: cid }),
    [cid],
  )

  const peek = useCallback(
    () => (cid ? peekSalesPlanGlanceSession(cid, reportDate) : null),
    [cid, reportDate],
  )
  const read = useCallback(
    () => (cid ? readSalesPlanGlanceSession(cid, reportDate) : null),
    [cid, reportDate],
  )
  const write = useCallback(
    (payload) => {
      if (cid) writeSalesPlanGlanceSession(cid, reportDate, payload)
    },
    [cid, reportDate],
  )
  const fetcher = useCallback(async () => {
    if (!cid) return null
    return fetchSalesPlanGlancePayload(cid)
  }, [cid])

  const { data, loading } = useStaleWhileRevalidate({
    enabled: Boolean(cid),
    deps: [cid, reportDate],
    peek,
    read,
    write,
    isFresh: isSalesPlanGlanceFresh,
    looksSame: salesPlanGlanceLooksSame,
    fetcher,
  })

  const fact = Number(data?.fact) || 0
  const planLevels = data?.planLevels ?? { level1: 0, level2: 0, level3: 0 }
  const monthLabel = data?.monthLabel ?? ''
  const forecastBundle = data?.forecastBundle ?? null
const showSkel = loading && !data
  const error = !loading && !data ? 'Не удалось загрузить план продаж' : ''

  const glanceForecast = useMemo(() => {
    if (!forecastBundle?.year || !forecastBundle?.month) return null
    return buildClubFinanceForecast({
      monthRows: forecastBundle.monthRows,
      year: forecastBundle.year,
      month: forecastBundle.month,
      expense: forecastBundle.expense,
      membershipTypes: forecastBundle.membershipTypes,
      planForm: forecastBundle.planForm,
      planConfig: forecastBundle.planConfig,
      profilesByTrainerId: forecastBundle.profilesByTrainerId,
      clubId: forecastBundle.clubId,
    })
  }, [forecastBundle])

  if (!cid) return null

  return (
    <Link
      to={salesHref}
      className={`admin-home-sales-plan u-no-decoration${compact ? ' admin-home-sales-plan--compact' : ''}`}
      aria-labelledby="admin-home-sales-plan-title"
      title="Открыть продажи"
    >
      <div className="admin-home-sales-plan__head">
        <div className="admin-home-sales-plan__titles">
          <h2 id="admin-home-sales-plan-title" className="admin-home-sales-plan__title">
            <TrendingUp size={18} aria-hidden className="admin-home-sales-plan__icon" />
            Продажи
          </h2>
          {monthLabel ? <p className="admin-home-sales-plan__month muted">{monthLabel}</p> : null}
        </div>
      </div>

      {showSkel ? (
        <div className="admin-home-sales-plan__skel" role="status" aria-busy="true" aria-label="Загрузка плана продаж">
          <div className="admin-home-skel admin-home-sales-plan__skel-bar" aria-hidden />
          <div className="admin-home-sales-plan__skel-row" aria-hidden>
            <div className="admin-home-skel admin-home-sales-plan__skel-chip" />
            <div className="admin-home-skel admin-home-sales-plan__skel-chip" />
            <div className="admin-home-skel admin-home-sales-plan__skel-chip" />
          </div>
          <div className="admin-home-sales-plan__skel-metrics" aria-hidden>
            <div className="admin-home-skel admin-home-sales-plan__skel-metric" />
            <div className="admin-home-skel admin-home-sales-plan__skel-metric" />
            <div className="admin-home-skel admin-home-sales-plan__skel-metric" />
          </div>
        </div>
      ) : error ? (
        <p className="muted admin-home-sales-plan__error" role="status">
          {error}
        </p>
      ) : (
        <>
          <div className="admin-home-sales-plan__vessel">
            <SalesPlanVessel fact={fact} planLevels={planLevels} />
          </div>
          {glanceForecast?.ok ? (
            <AdminHomeSalesGlanceMetrics fact={glanceForecast.fact} forecast={glanceForecast.forecast} />
          ) : null}
        </>
      )}
    </Link>
  )
}
