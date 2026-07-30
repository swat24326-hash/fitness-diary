import { useCallback, useEffect, useState } from 'react'
import { Compass, RefreshCw } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { gapToPlanLevel3, pzDkShareOfAnchor } from '../lib/admin/salesHallAnchorCore.js'
import { loadSalesStrategyAnchor } from '../lib/admin/salesHallAnchorService.js'
import { SALES_SEASON_DEFAULTS, getSalesSeasonMonthDef } from '../lib/admin/salesSeasonCore.js'
import { planMatrixAvgField, planMatrixCountField } from '../lib/admin/salesPlanMatrixCore.js'
import { SalesPlanPzDkSuggestBar } from './SalesPlanPzDkSuggestBar.jsx'

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
 * Вкладка «Стратегия»: якорь часов/₽ × сезон + ориентир ПЗ·ДК.
 *
 * @param {{
 *   clubId: string,
 *   membershipTypes?: object[],
 *   planForm: Record<string, string>,
 *   onPlanChange: (next: Record<string, string>) => void,
 *   onSelectPlanMonth?: (ym: { year: number, month: number }) => void,
 *   onToast?: (text: string, tone?: 'ok' | 'err' | 'warn') => void,
 * }} props
 */
export function SalesStrategyPanel({
  clubId,
  membershipTypes: typesProp = [],
  planForm,
  onPlanChange,
  onSelectPlanMonth,
  onToast,
}) {
  const [horizon, setHorizon] = useState(/** @type {'current' | 'next'} */ ('next'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(/** @type {object | null} */ (null))

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
      if (res.planForm && typeof onPlanChange === 'function') {
        onPlanChange(res.planForm)
      }
      if (res.target && typeof onSelectPlanMonth === 'function') {
        onSelectPlanMonth({ year: res.target.year, month: res.target.month })
      }
    } catch (e) {
      setPayload(null)
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }, [clubId, horizon, onPlanChange, onSelectPlanMonth])

  useEffect(() => {
    void load()
  }, [load])

  const projection = payload?.projection
  const planYm = payload?.target
  const membershipTypes = (payload?.membershipTypes?.length ? payload.membershipTypes : typesProp) ?? []
  const gap =
    projection?.ok && payload?.planLevel3
      ? gapToPlanLevel3(payload.planLevel3, projection.expectedRub)
      : null

  const pzCount = Number(planForm?.[planMatrixCountField('pz_dk')]) || 0
  const pzAvg = Number(String(planForm?.[planMatrixAvgField('pz_dk')] ?? '').replace(',', '.')) || 0
  const pzAmount = pzCount > 0 && pzAvg > 0 ? Math.round(pzCount * pzAvg * 100) / 100 : null
  const share =
    projection?.ok && pzAmount != null ? pzDkShareOfAnchor(pzAmount, projection.expectedRub) : null

  return (
    <section className="sales-strategy" aria-labelledby="sales-strategy-title">
      <header className="sales-strategy__head">
        <div className="sales-strategy__head-text">
          <p className="sales-strategy__eyebrow">Продажи · ориентир</p>
          <h2 className="sales-strategy__title" id="sales-strategy-title">
            <Compass size={22} aria-hidden style={{ verticalAlign: -4, marginRight: 8 }} />
            Стратегия
          </h2>
          <p className="sales-strategy__lead muted">
            Якорь зала — персональные часы и выручка из отчёта менеджера за прошлый месяц × сезон.
            Продления ПЗ·ДК по картам — отдельный кусок плана, не весь месяц.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-icon-square"
          onClick={() => void load()}
          disabled={busy || !clubId}
          aria-label="Обновить"
          title="Обновить"
        >
          <RefreshCw size={16} aria-hidden className={busy ? 'icon-spin' : undefined} />
        </button>
      </header>

      <div className="sales-strategy__horizon" role="group" aria-label="Месяц плана">
        <button
          type="button"
          className={`sales-strategy__chip${horizon === 'current' ? ' is-active' : ''}`}
          onClick={() => setHorizon('current')}
          disabled={busy}
        >
          Текущий месяц
        </button>
        <button
          type="button"
          className={`sales-strategy__chip${horizon === 'next' ? ' is-active' : ''}`}
          onClick={() => setHorizon('next')}
          disabled={busy}
        >
          Следующий месяц
        </button>
      </div>

      {error ? (
        <p className="sync-feedback sync-feedback--err" role="alert">
          {error}
        </p>
      ) : null}

      {busy && !projection ? (
        <p className="muted" role="status">
          Считаем якорь…
        </p>
      ) : null}

      {projection?.ok ? (
        <div className="sales-strategy__grid">
          <article className="sales-strategy__card">
            <h3 className="sales-strategy__card-title">База · отчёт менеджера</h3>
            <p className="sales-strategy__card-sub muted">
              {monthTitle(projection.base.year, projection.base.month)} ·{' '}
              {projection.base.season.labelRu} (×{projection.base.season.coef})
            </p>
            <div className="sales-strategy__kpis">
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Часы</span>
                <strong className="sales-strategy__kpi-value">{projection.base.hours}</strong>
              </div>
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Выручка</span>
                <strong className="sales-strategy__kpi-value">{formatRub(projection.base.rub)}</strong>
              </div>
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">из них ДК</span>
                <strong className="sales-strategy__kpi-value">{formatRub(projection.base.rubDk)}</strong>
              </div>
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Дней в отчёте</span>
                <strong className="sales-strategy__kpi-value">
                  {projection.base.dayCount}/{projection.base.daysInMonth}
                </strong>
              </div>
            </div>
            {!projection.reliable ? (
              <p className="sales-strategy__warn" role="status">
                Мало заполненных дней (&lt; {Math.round(projection.minFillRatio * 100)}%) — якорь
                ненадёжен.
              </p>
            ) : null}
            {projection.rubPerHour != null ? (
              <p className="muted sales-strategy__meta">≈ {formatRub(projection.rubPerHour)} / час</p>
            ) : null}
          </article>

          <article className="sales-strategy__card sales-strategy__card--accent">
            <h3 className="sales-strategy__card-title">Ожидание на план</h3>
            <p className="sales-strategy__card-sub muted">
              {planYm ? monthTitle(planYm.year, planYm.month) : '—'} ·{' '}
              {projection.plan.season.labelRu} (×{projection.plan.season.coef}) · масштаб ×
              {projection.scale}
            </p>
            <div className="sales-strategy__kpis">
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Часы*</span>
                <strong className="sales-strategy__kpi-value">{projection.expectedHours}</strong>
              </div>
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Выручка*</span>
                <strong className="sales-strategy__kpi-value">{formatRub(projection.expectedRub)}</strong>
              </div>
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Уровень 3</span>
                <strong className="sales-strategy__kpi-value">
                  {payload?.planLevel3 ? formatRub(payload.planLevel3) : '—'}
                </strong>
              </div>
              <div className="sales-strategy__kpi">
                <span className="sales-strategy__kpi-label">Дыра до уровня</span>
                <strong className="sales-strategy__kpi-value">
                  {gap == null ? '—' : formatRub(gap)}
                </strong>
              </div>
            </div>
            <p className="muted sales-strategy__meta">
              * Ожидание = база × (сезон плана ÷ сезон базы). Матрицу не заполняет само.
            </p>
          </article>
        </div>
      ) : null}

      <details className="sales-strategy__season">
        <summary>Календарь сезонности</summary>
        <div className="sales-strategy__season-grid">
          {Object.keys(SALES_SEASON_DEFAULTS).map((k) => {
            const m = Number(k)
            const def = getSalesSeasonMonthDef(m)
            if (!def) return null
            return (
              <div
                key={m}
                className={`sales-strategy__season-cell sales-strategy__season-cell--${def.mode}`}
              >
                <span className="sales-strategy__season-month">{MONTH_RU[m - 1]?.slice(0, 3)}</span>
                <strong>×{def.coef}</strong>
                <span className="muted">{def.labelRu}</span>
              </div>
            )
          })}
        </div>
      </details>

      {planYm && clubId ? (
        <div className="sales-strategy__pz">
          <h3 className="sales-strategy__section-title">Кусок продлений · ПЗ ДК</h3>
          <p className="muted sales-strategy__pz-lead">
            Прайс × действующие карты (контур планшетов). Это не весь план.
            {share != null ? (
              <>
                {' '}
                Сейчас в форме ≈ <strong>{Math.round(share * 100)}%</strong> от ожидаемой выручки якоря.
              </>
            ) : null}
          </p>
          <SalesPlanPzDkSuggestBar
            key={`${planYm.year}-${planYm.month}-${horizon}`}
            clubId={clubId}
            year={planYm.year}
            month={planYm.month}
            membershipTypes={membershipTypes}
            monthDays={payload?.planMonthDays ?? []}
            planForm={planForm}
            onPlanChange={onPlanChange}
            fixedHorizon={horizon}
            disabled={busy}
            onToast={onToast}
            applyHint="Откройте «План месяца», добейте ячейки до уровня 3 и сохраните направления."
          />
          <p className="muted sales-strategy__pz-foot">
            «В план» заполняет только ПЗ·ДК в форме. Матрицу и сохранение — вкладка «План месяца»
            (управляющий).
          </p>
        </div>
      ) : null}
    </section>
  )
}
