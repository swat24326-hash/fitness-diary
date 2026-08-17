import { formatRub } from '../../lib/admin/salesReportCore.js'
import {
  describeNetProfitMarginTone,
  formatNetProfitMarginPercent,
} from '../../lib/admin/clubNetProfitMarginCore.js'

const ROWS = [
  { key: 'netProfit', label: 'Чистая прибыль', kind: 'money', signed: true },
  { key: 'netProfitMargin', label: 'Маржа по валу', kind: 'percent' },
  { key: 'pzTrainings', label: 'Тренировки ПЗ', kind: 'count' },
  { key: 'azTrainings', label: 'Тренировки АЗ', kind: 'count' },
]

/**
 * @param {'money' | 'count' | 'percent'} kind
 * @param {unknown} value
 * @param {{ signed?: boolean }} [opts]
 */
function formatGlanceValue(kind, value, { signed = false } = {}) {
  if (value == null || !Number.isFinite(Number(value))) {
    if (kind === 'percent') return '—'
    return '—'
  }
  if (kind === 'percent') return formatNetProfitMarginPercent(value)
  if (kind === 'count') return new Intl.NumberFormat('ru-RU').format(Number(value) || 0)
  const n = Number(value) || 0
  return formatRub(signed ? n : Math.abs(n))
}

function marginToneClass(value) {
  if (value == null) return ''
  const { tone } = describeNetProfitMarginTone(value)
  return tone === 'muted' ? '' : ` is-margin-${tone}`
}

/**
 * Компактные факт / прогноз под шкалой плана на главной.
 *
 * @param {{
 *   fact?: Record<string, number> | null,
 *   forecast?: Record<string, number> | null,
 * }} props
 */
export function AdminHomeSalesGlanceMetrics({ fact = null, forecast = null }) {
  if (!fact || !forecast) return null

  return (
    <ul className="admin-home-sales-plan__metrics" aria-label="Факт и прогноз месяца">
      {ROWS.map((row) => {
        const factVal = fact[row.key]
        const forecastVal = forecast[row.key]
        const factNeg = Boolean(row.signed) && Number(factVal) < 0
        const forecastNeg = Boolean(row.signed) && Number(forecastVal) < 0
        const factTone = row.kind === 'percent' ? marginToneClass(factVal) : factNeg ? ' is-negative' : ''
        const forecastTone =
          row.kind === 'percent' ? marginToneClass(forecastVal) : forecastNeg ? ' is-negative' : ''
        const factTitle =
          row.kind === 'percent' && factVal != null
            ? describeNetProfitMarginTone(factVal).labelRu
            : undefined
        const forecastTitle =
          row.kind === 'percent' && forecastVal != null
            ? describeNetProfitMarginTone(forecastVal).labelRu
            : undefined
        return (
          <li key={row.key} className="admin-home-sales-plan__metric">
            <span className="admin-home-sales-plan__metric-label">{row.label}</span>
            <span className={`admin-home-sales-plan__metric-fact${factTone}`} title={factTitle}>
              {formatGlanceValue(row.kind, factVal, { signed: row.signed })}
            </span>
            <span className={`admin-home-sales-plan__metric-forecast${forecastTone}`} title={forecastTitle}>
              {formatGlanceValue(row.kind, forecastVal, { signed: row.signed })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
