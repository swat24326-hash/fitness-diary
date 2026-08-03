import { formatRub } from '../lib/admin/salesReportCore.js'
import { SALES_SEASON_DEFAULTS, getSalesSeasonMonthDef } from '../lib/admin/salesSeasonCore.js'

const MONTH_RU_SHORT = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
]

/**
 * Справка: сезонность и старый сезонный якорь (не ядро экрана).
 *
 * @param {{
 *   projection?: object|null,
 *   planLevel3?: number|null,
 *   planMonthLabel?: string,
 * }} props
 */
export function SalesStrategyReferenceDetails({
  projection = null,
  planLevel3 = null,
  planMonthLabel = '',
}) {
  const base = projection?.ok ? projection.base : null
  const plan = projection?.ok ? projection.plan : null

  return (
    <details className="sales-strategy__season">
      <summary>Справка: сезон и отчёт менеджера</summary>
      <p className="muted sales-strategy__ref-lead">
        Раньше здесь считали «ожидание» = база × сезон. Пакет плана это не задаёт — только доли
        НК/УК из прошлого месяца. Ниже — если нужно сверить отчёт.
      </p>

      {projection?.ok && base && plan ? (
        <div className="sales-strategy__ref-kpis">
          <div>
            <span className="sales-strategy__kpi-label">База · часы / ₽</span>
            <strong className="sales-strategy__kpi-value">
              {base.hours} · {formatRub(base.rub)}
            </strong>
            <span className="muted sales-strategy__ref-sub">
              {MONTH_RU_SHORT[(base.month || 1) - 1]} {base.year} · {base.season.labelRu} (×
              {base.season.coef}) · дней {base.dayCount}/{base.daysInMonth}
            </span>
          </div>
          <div>
            <span className="sales-strategy__kpi-label">Сезон на план · масштаб</span>
            <strong className="sales-strategy__kpi-value">×{projection.scale}</strong>
            <span className="muted sales-strategy__ref-sub">
              {planMonthLabel || '—'} · {plan.season.labelRu} (×{plan.season.coef})
              {planLevel3 != null && planLevel3 > 0
                ? ` · ур. 3 ${formatRub(planLevel3)}`
                : ''}
            </span>
          </div>
        </div>
      ) : null}

      {!projection?.reliable && projection?.ok ? (
        <p className="sales-strategy__warn" role="status">
          Мало заполненных дней в отчёте (&lt; {Math.round(projection.minFillRatio * 100)}%) —
          доли НК/УК могут быть шумными.
        </p>
      ) : null}

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
              <span className="sales-strategy__season-month">{MONTH_RU_SHORT[m - 1]}</span>
              <strong>×{def.coef}</strong>
              <span className="muted">{def.labelRu}</span>
            </div>
          )
        })}
      </div>
    </details>
  )
}
