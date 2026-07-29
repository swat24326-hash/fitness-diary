import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { todayLocalIso } from '../../lib/dateRu.js'
import { buildAdminClubQueryHref } from '../../lib/admin/adminClientQuickFilters.js'
import {
  isSalesPlanGlanceFresh,
  readSalesPlanGlanceSession,
  writeSalesPlanGlanceSession,
} from '../../lib/admin/salesPlanGlanceSession.js'
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

function applyGlancePayload(payload, setters) {
  setters.setMonthLabel(payload.monthLabel ?? '')
  setters.setFact(Number(payload.fact) || 0)
  setters.setPlanLevels(
    payload.planLevels ?? { level1: 0, level2: 0, level3: 0 },
  )
  setters.setForecastBundle(payload.forecastBundle ?? null)
  setters.setError('')
}

/**
 * Факт / план месяца на главной админа — тап по карточке открывает продажи.
 * @param {{ clubId: string, compact?: boolean }} props
 */
export function AdminHomeSalesPlanGlance({ clubId = '', compact = false }) {
  const [loading, setLoading] = useState(true)
  const [fact, setFact] = useState(0)
  const [planLevels, setPlanLevels] = useState({ level1: 0, level2: 0, level3: 0 })
  const [monthLabel, setMonthLabel] = useState('')
  const [error, setError] = useState('')
  const [forecastBundle, setForecastBundle] = useState(null)
  const genRef = useRef(0)

  const salesHref = useMemo(
    () => buildAdminClubQueryHref('/admin/sales', { clubId }),
    [clubId],
  )

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    const cid = String(clubId || '').trim()
    if (!cid) {
      setFact(0)
      setPlanLevels({ level1: 0, level2: 0, level3: 0 })
      setMonthLabel('')
      setError('')
      setForecastBundle(null)
      setLoading(false)
      return
    }
    const reportDate = todayLocalIso()
    const cached = readSalesPlanGlanceSession(cid, reportDate)
    if (cached?.payload && isSalesPlanGlanceFresh(cached.savedAt) && !force) {
      applyGlancePayload(cached.payload, {
        setMonthLabel,
        setFact,
        setPlanLevels,
        setForecastBundle,
        setError,
      })
      setLoading(false)
      return
    }
    if (cached?.payload && silent) {
      applyGlancePayload(cached.payload, {
        setMonthLabel,
        setFact,
        setPlanLevels,
        setForecastBundle,
        setError,
      })
    }

    const gen = ++genRef.current
    if (!silent) setLoading(true)
    try {
      const bundle = await fetchClubSalesBundle({ clubId: cid, reportDate })
      if (gen !== genRef.current) return
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
      const payload = {
        monthLabel: parts ? `${name} ${parts.year}` : '',
        fact: resolvePlanFactFromMonthSummary(bundle.monthSummary),
        planLevels: levels,
        forecastBundle: {
          year: Number(bundle.year) || parts?.year || 0,
          month: Number(bundle.month) || parts?.month || 0,
          monthRows: Array.isArray(bundle.monthDays) ? bundle.monthDays : [],
          membershipTypes: Array.isArray(bundle.membershipTypes) ? bundle.membershipTypes : [],
          planForm: form,
          expense: Number.isFinite(expenseRaw) ? expenseRaw : 0,
        },
      }
      applyGlancePayload(payload, {
        setMonthLabel,
        setFact,
        setPlanLevels,
        setForecastBundle,
        setError,
      })
      writeSalesPlanGlanceSession(cid, reportDate, payload)
    } catch (err) {
      if (gen !== genRef.current) return
      if (!cached?.payload) {
        setForecastBundle(null)
        setError(err?.message ?? 'Не удалось загрузить план продаж')
      }
    } finally {
      if (gen === genRef.current) setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void load()
    return () => {
      genRef.current += 1
    }
  }, [load])

  const glanceForecast = useMemo(() => {
    if (!forecastBundle?.year || !forecastBundle?.month) return null
    return buildClubFinanceForecast({
      monthRows: forecastBundle.monthRows,
      year: forecastBundle.year,
      month: forecastBundle.month,
      expense: forecastBundle.expense,
      membershipTypes: forecastBundle.membershipTypes,
      planForm: forecastBundle.planForm,
    })
  }, [forecastBundle])

  if (!String(clubId || '').trim()) return null

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

      {loading ? (
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
