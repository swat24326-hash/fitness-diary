import { formatRub } from '../../lib/admin/salesReportCore.js'
import {
  NET_PROFIT_MARGIN_LABEL_RU,
  describeNetProfitMarginTone,
  formatNetProfitMarginPercent,
} from '../../lib/admin/clubNetProfitMarginCore.js'

const ROWS = [
  {
    key: 'netProfit',
    label: 'Чистая прибыль',
    labelShort: 'Прибыль',
    kind: 'money',
    signed: true,
    group: 'finance',
  },
  {
    key: 'netProfitMargin',
    label: NET_PROFIT_MARGIN_LABEL_RU,
    labelShort: 'Рентабельность',
    kind: 'percent',
    group: 'finance',
  },
  {
    key: 'pzTrainings',
    label: 'Тренировки ПЗ',
    labelShort: 'ПЗ',
    kind: 'count',
    group: 'load',
  },
  {
    key: 'azTrainings',
    label: 'Тренировки АЗ',
    labelShort: 'АЗ',
    kind: 'count',
    group: 'load',
  },
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
 * @param {{
 *   row: (typeof ROWS)[number],
 *   fact: Record<string, number>,
 *   forecast: Record<string, number>,
 *   shortLabels: boolean,
 * }} props
 */
function MetricRow({ row, fact, forecast, shortLabels }) {
  const factVal = fact[row.key]
  const forecastVal = forecast[row.key]
  const factNeg = Boolean(row.signed) && Number(factVal) < 0
  const forecastNeg = Boolean(row.signed) && Number(forecastVal) < 0
  const factTone = row.kind === 'percent' ? marginToneClass(factVal) : factNeg ? ' is-negative' : ''
  const forecastTone =
    row.kind === 'percent' ? marginToneClass(forecastVal) : forecastNeg ? ' is-negative' : ''
  const factTitle =
    row.kind === 'percent' && factVal != null ? describeNetProfitMarginTone(factVal).labelRu : undefined
  const forecastTitle =
    row.kind === 'percent' && forecastVal != null
      ? describeNetProfitMarginTone(forecastVal).labelRu
      : undefined
  const label = shortLabels ? row.labelShort : row.label

  return (
    <li className="admin-home-sales-plan__metric">
      <span className="admin-home-sales-plan__metric-label" title={row.label}>
        {label}
      </span>
      <span className={`admin-home-sales-plan__metric-fact${factTone}`} title={factTitle}>
        {formatGlanceValue(row.kind, factVal, { signed: row.signed })}
      </span>
      <span className={`admin-home-sales-plan__metric-forecast${forecastTone}`} title={forecastTitle}>
        {formatGlanceValue(row.kind, forecastVal, { signed: row.signed })}
      </span>
    </li>
  )
}

/**
 * Факт / прогноз: на главной — под шкалой; в hero продаж — rail справа.
 *
 * @param {{
 *   fact?: Record<string, number> | null,
 *   forecast?: Record<string, number> | null,
 *   layout?: 'stack' | 'rail',
 * }} props
 */
export function AdminHomeSalesGlanceMetrics({ fact = null, forecast = null, layout = 'stack' }) {
  if (!fact || !forecast) return null

  const rail = layout === 'rail'
  const finance = ROWS.filter((r) => r.group === 'finance')
  const load = ROWS.filter((r) => r.group === 'load')

  return (
    <ul
      className={`admin-home-sales-plan__metrics${rail ? ' admin-home-sales-plan__metrics--rail' : ''}`}
      aria-label="Факт и прогноз месяца"
    >
      {rail ? (
        <li className="admin-home-sales-plan__metric admin-home-sales-plan__metric--head" aria-hidden>
          <span className="admin-home-sales-plan__metric-label" />
          <span className="admin-home-sales-plan__metric-fact">Факт</span>
          <span className="admin-home-sales-plan__metric-forecast">Прогноз</span>
        </li>
      ) : null}
      {finance.map((row) => (
        <MetricRow key={row.key} row={row} fact={fact} forecast={forecast} shortLabels={rail} />
      ))}
      {rail ? <li className="admin-home-sales-plan__metric-sep" aria-hidden /> : null}
      {load.map((row) => (
        <MetricRow key={row.key} row={row} fact={fact} forecast={forecast} shortLabels={rail} />
      ))}
    </ul>
  )
}
