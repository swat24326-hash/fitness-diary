import { useCallback, useEffect, useMemo, useState } from 'react'
import { mergeStrategyPlanFormWithClub } from '../lib/admin/salesHallAnchorCore.js'
import { loadSalesStrategyAnchor } from '../lib/admin/salesHallAnchorService.js'
import { resolvePlanFinalTarget } from '../lib/admin/salesReportCore.js'
import { SalesPlanHallRenewalsSuggestBar } from './SalesPlanHallRenewalsSuggestBar.jsx'
import { SalesStrategyHat } from './SalesStrategyHat.jsx'
import { SalesStrategyReferenceDetails } from './SalesStrategyReferenceDetails.jsx'

const MONTH_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

function monthTitle(year, month) {
  const name = MONTH_RU[(month || 1) - 1] ?? ''
  return `${name} ${year}`
}

/**
 * Вкладка «Стратегия»: шапка (месяц / ур. 3 / Посчитать) + рабочая зона на всю ширину.
 *
 * @param {{
 *   clubId: string,
 *   membershipTypes?: object[],
 *   clubPlanForm?: Record<string, string>,
 *   clubPlanYear?: number,
 *   clubPlanMonth?: number,
 *   onPlanChange?: (next: Record<string, string>) => void,
 *   onSelectPlanMonth?: (ym: { year: number, month: number }) => void,
 *   onToast?: (text: string, tone?: 'ok' | 'err' | 'warn') => void,
 * }} props
 */
export function SalesStrategyPanel({
  clubId,
  membershipTypes: _membershipTypes = [],
  clubPlanForm = null,
  clubPlanYear,
  clubPlanMonth,
  onPlanChange,
  onSelectPlanMonth,
  onToast,
}) {
  const [horizon, setHorizon] = useState(/** @type {'current' | 'next'} */ ('current'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(/** @type {object | null} */ (null))
  const [strategyPlanForm, setStrategyPlanForm] = useState(/** @type {Record<string, string>} */ ({}))

  const clubYm = useMemo(() => {
    const y = Number(clubPlanYear)
    const m = Number(clubPlanMonth)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
    return { year: y, month: m }
  }, [clubPlanYear, clubPlanMonth])

  const load = useCallback(async () => {
    if (!clubId) return
    setBusy(true)
    setError('')
    try {
      const res = await loadSalesStrategyAnchor({ clubId, horizon })
      if (!res.ok) {
        setPayload(null)
        setError(res.error || 'Не удалось загрузить стратегию')
        return
      }
      setPayload(res)
      setStrategyPlanForm(res.planForm ?? {})
    } catch (e) {
      setPayload(null)
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }, [clubId, horizon])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!payload?.target) return
    setStrategyPlanForm((prev) =>
      mergeStrategyPlanFormWithClub(prev, clubPlanForm, payload.target, clubYm),
    )
  }, [clubPlanForm, clubYm, payload?.target, payload?.planForm])

  const applyPlanForm = useCallback(
    (next) => {
      setStrategyPlanForm(next)
      if (payload?.target && typeof onSelectPlanMonth === 'function') {
        onSelectPlanMonth({ year: payload.target.year, month: payload.target.month })
      }
      if (typeof onPlanChange === 'function') onPlanChange(next)
    },
    [onPlanChange, onSelectPlanMonth, payload?.target],
  )

  const planYm = payload?.target
  const baseYm = payload?.baseYm
  const planMonthLabel = planYm ? monthTitle(planYm.year, planYm.month) : ''
  const prevMonthLabel = baseYm ? monthTitle(baseYm.year, baseYm.month) : ''

  const planLevel3 = resolvePlanFinalTarget({
    plan_level_1: Number(strategyPlanForm.plan_level_1) || 0,
    plan_level_2: Number(strategyPlanForm.plan_level_2) || 0,
    plan_level_3: Number(strategyPlanForm.plan_level_3) || 0,
  })

  return (
    <section className="sales-strategy sales-strategy--dashboard" aria-labelledby="sales-strategy-title">
      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      {busy && !planYm ? (
        <p className="muted" role="status">
          Загружаем план…
        </p>
      ) : null}

      {planYm && clubId ? (
        <SalesPlanHallRenewalsSuggestBar
          key={`${planYm.year}-${planYm.month}-${horizon}`}
          clubId={clubId}
          year={planYm.year}
          month={planYm.month}
          monthDays={payload?.planMonthDays ?? []}
          prevMonthDays={payload?.prevMonthDays ?? []}
          prevMonthYear={payload?.baseYm?.year}
          prevMonthMonth={payload?.baseYm?.month}
          planForm={strategyPlanForm}
          onPlanChange={applyPlanForm}
          fixedHorizon={horizon}
          disabled={busy}
          onToast={onToast}
          applyHint="Месяц в шапке переключится на план — сохраните во вкладке «План месяца»."
          initialStrategyHydration={payload?.strategySnapshot ?? null}
          layout="dashboard"
          renderChrome={({ controls, packColumn, playbookColumn, emptyHint }) => (
            <>
              <SalesStrategyHat
                busy={busy}
                canRefresh={Boolean(clubId)}
                onRefresh={() => void load()}
                horizon={horizon}
                onHorizon={setHorizon}
                monthLabel={planMonthLabel}
                planLevel3={planLevel3 > 0 ? planLevel3 : null}
                prevMonthLabel={prevMonthLabel}
                controls={controls}
              />
              <div className="sales-strategy__workspace">
                <div className="sales-strategy__workspace-pack">
                  {packColumn}
                  {emptyHint}
                </div>
                <div className="sales-strategy__workspace-playbook">{playbookColumn}</div>
              </div>
              <SalesStrategyReferenceDetails
                projection={payload?.projection}
                planLevel3={planLevel3 > 0 ? planLevel3 : null}
                planMonthLabel={planMonthLabel}
              />
            </>
          )}
        />
      ) : (
        <>
          <SalesStrategyHat
            busy={busy}
            canRefresh={Boolean(clubId)}
            onRefresh={() => void load()}
            horizon={horizon}
            onHorizon={setHorizon}
            monthLabel={planMonthLabel}
            planLevel3={planLevel3 > 0 ? planLevel3 : null}
            prevMonthLabel={prevMonthLabel}
          />
          <SalesStrategyReferenceDetails
            projection={payload?.projection}
            planLevel3={planLevel3 > 0 ? planLevel3 : null}
            planMonthLabel={planMonthLabel}
          />
        </>
      )}
    </section>
  )
}
