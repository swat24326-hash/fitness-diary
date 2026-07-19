import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { SalesPlanVessel } from '../SalesPlanVessel.jsx'
import { fetchClubSalesBundle } from '../../lib/admin/adminSalesService.js'
import {
  monthPartsFromIso,
  planRowToForm,
  resolvePlanFactFromMonthSummary,
} from '../../lib/admin/salesReportCore.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { buildAdminClubQueryHref } from '../../lib/admin/adminClientQuickFilters.js'
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

/**
 * Факт / план месяца на главной админа — тот же сосуд, что в продажах, в оболочке admin-home.
 * @param {{ clubId: string }} props
 */
export function AdminHomeSalesPlanGlance({ clubId = '' }) {
  const [loading, setLoading] = useState(true)
  const [fact, setFact] = useState(0)
  const [planLevels, setPlanLevels] = useState({ level1: 0, level2: 0, level3: 0 })
  const [monthLabel, setMonthLabel] = useState('')
  const [error, setError] = useState('')
  const genRef = useRef(0)

  const salesHref = useMemo(
    () => buildAdminClubQueryHref('/admin/sales', { clubId }),
    [clubId],
  )

  const load = useCallback(async ({ silent = false } = {}) => {
    const cid = String(clubId || '').trim()
    if (!cid) {
      setFact(0)
      setPlanLevels({ level1: 0, level2: 0, level3: 0 })
      setMonthLabel('')
      setError('')
      setLoading(false)
      return
    }
    const gen = ++genRef.current
    if (!silent) setLoading(true)
    try {
      const reportDate = todayLocalIso()
      const bundle = await fetchClubSalesBundle({ clubId: cid, reportDate })
      if (gen !== genRef.current) return
      const parts = monthPartsFromIso(reportDate)
      const name = parts ? MONTH_NAMES[(parts.month || 1) - 1] ?? '' : ''
      setMonthLabel(parts ? `${name} ${parts.year}` : '')
      setFact(resolvePlanFactFromMonthSummary(bundle.monthSummary))
      const form = planRowToForm(bundle.plan)
      setPlanLevels({
        level1: Number(form.plan_level_1) || 0,
        level2: Number(form.plan_level_2) || 0,
        level3: Number(form.plan_level_3) || 0,
      })
      setError('')
    } catch (err) {
      if (gen !== genRef.current) return
      setError(err?.message ?? 'Не удалось загрузить план продаж')
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

  if (!String(clubId || '').trim()) return null

  return (
    <section className="admin-home-sales-plan" aria-labelledby="admin-home-sales-plan-title">
      <div className="admin-home-sales-plan__head">
        <div className="admin-home-sales-plan__titles">
          <h2 id="admin-home-sales-plan-title" className="admin-home-sales-plan__title">
            <TrendingUp size={18} aria-hidden className="admin-home-sales-plan__icon" />
            Продажи
          </h2>
          {monthLabel ? <p className="admin-home-sales-plan__month muted">{monthLabel}</p> : null}
        </div>
        <Link to={salesHref} className="btn btn-ghost btn-sm btn-touch admin-home-sales-plan__link">
          Открыть
        </Link>
      </div>

      {loading ? (
        <div className="admin-path-loading" role="status" aria-busy="true">
          <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
          <p className="admin-path-loading__text">Загрузка плана…</p>
        </div>
      ) : error ? (
        <p className="muted admin-home-sales-plan__error" role="status">
          {error}
        </p>
      ) : (
        <div className="admin-home-sales-plan__vessel">
          <SalesPlanVessel fact={fact} planLevels={planLevels} />
        </div>
      )}
    </section>
  )
}
