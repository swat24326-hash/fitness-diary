import { Check, Minus } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'

/**
 * @param {number} pct
 * @param {'count'|'amount'|'avg'} kind
 */
function compareToneClass(pct, kind, gapRub) {
  if (kind === 'avg') {
    if (gapRub == null) return ''
    return Number(gapRub) < 0 ? ' sales-report__compare-cell--warn' : ' sales-report__compare-cell--ok'
  }
  const n = Number(pct) || 0
  if (n >= 95) return ' sales-report__compare-cell--ok'
  if (n >= 70) return ' sales-report__compare-cell--mid'
  return ' sales-report__compare-cell--warn'
}

/**
 * @param {{
 *   comparison: {
 *     rows?: Array<Record<string, unknown>>,
 *     summary_ru?: string,
 *     status_summary?: { ok?: number, lag?: number, total?: number },
 *     calendar_elapsed_pct?: number,
 *   },
 * }} props
 */
export function SalesPlanMatrixCompareTable({ comparison }) {
  const rows = comparison?.rows ?? []
  const statusSummary = comparison?.status_summary ?? { ok: 0, lag: 0, total: rows.length }
  const elapsedPct = Number(comparison?.calendar_elapsed_pct) || 0

  if (!rows.length) return null

  return (
    <div className="sales-report__plan-compare">
      <div className="sales-report__plan-compare-head">
        {comparison.summary_ru ? (
          <p className="sales-report__plan-compare-summary" role="status">
            {comparison.summary_ru}
          </p>
        ) : null}
        <div className="sales-report__plan-compare-chips" aria-label="Сводка по статусам">
          <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--ok">
            <Check size={14} aria-hidden />
            {statusSummary.ok} в темпе
          </span>
          <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--lag">
            <Minus size={14} aria-hidden />
            {statusSummary.lag} отстают
          </span>
          {elapsedPct > 0 ? (
            <span className="sales-report__plan-compare-chip sales-report__plan-compare-chip--muted">
              Календарь: {Math.round(elapsedPct)}%
            </span>
          ) : null}
        </div>
      </div>
      <div className="sales-report__matrix-scroll sales-report__matrix-scroll--stats sales-report__matrix-scroll--compare">
        <table className="sales-report__matrix sales-report__stats-matrix sales-report__matrix--compare">
          <thead>
            <tr>
              <th rowSpan={2} className="sales-report__matrix-row-label sales-report__stats-matrix-corner" scope="col">
                Сегмент
              </th>
              <th rowSpan={2} className="sales-report__matrix-subhead sales-report__compare-status-head" scope="col">
                Статус
              </th>
              <th colSpan={4} className="sales-report__matrix-group-head sales-report__compare-group-head" scope="col">
                Количество
              </th>
              <th colSpan={3} className="sales-report__matrix-group-head sales-report__compare-group-head" scope="col">
                Средний чек
              </th>
              <th colSpan={2} className="sales-report__matrix-group-head sales-report__compare-group-head" scope="col">
                Сумма
              </th>
            </tr>
            <tr>
              <th className="sales-report__matrix-subhead" scope="col">план</th>
              <th className="sales-report__matrix-subhead" scope="col">факт</th>
              <th className="sales-report__matrix-subhead" scope="col">Δ</th>
              <th className="sales-report__matrix-subhead" scope="col">%</th>
              <th className="sales-report__matrix-subhead" scope="col">план</th>
              <th className="sales-report__matrix-subhead" scope="col">факт</th>
              <th className="sales-report__matrix-subhead" scope="col">Δ</th>
              <th className="sales-report__matrix-subhead" scope="col">план</th>
              <th className="sales-report__matrix-subhead" scope="col">факт</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const countTone = compareToneClass(row.count_progress_pct, 'count')
              const amountTone = compareToneClass(row.amount_progress_pct, 'amount')
              const avgTone = compareToneClass(0, 'avg', row.avg_gap_rub)
              const st = row.status ?? {}
              const statusClass =
                st.status === 'ok'
                  ? ' sales-report__compare-status--ok'
                  : st.status === 'lag'
                    ? ' sales-report__compare-status--lag'
                    : ' sales-report__compare-status--muted'
              return (
                <tr
                  key={row.cellKey}
                  className={`sales-report__stats-matrix-row sales-report__compare-row sales-report__compare-row--${row.hall}`}
                  data-col={row.col}
                >
                  <th
                    className={`sales-report__matrix-row-label sales-report__stats-matrix-row-label sales-report__compare-segment sales-report__compare-segment--${row.col}`}
                    scope="row"
                  >
                    <span className="sales-report__compare-segment-hall">{String(row.label).split(' ')[0]}</span>
                    <span className="sales-report__compare-segment-col">{String(row.label).split(' ')[1]}</span>
                  </th>
                  <td className={`sales-report__compare-status${statusClass}`}>
                    <span className="sales-report__compare-status-icon" title={st.title ?? ''} aria-label={st.title ?? st.label}>
                      {st.status === 'ok' ? (
                        <Check size={18} strokeWidth={2.5} aria-hidden />
                      ) : st.status === 'lag' ? (
                        <Minus size={18} strokeWidth={2.5} aria-hidden />
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="sales-report__compare-status-label">{st.label ?? '—'}</span>
                  </td>
                  <td className="sales-report__matrix-computed sales-report__compare-num">{row.plan.count}</td>
                  <td className="sales-report__matrix-computed sales-report__compare-num sales-report__compare-num--fact">
                    {row.fact.count}
                  </td>
                  <td className={`sales-report__matrix-computed sales-report__compare-num${countTone}`}>
                    {row.count_gap > 0 ? `+${row.count_gap}` : row.count_gap}
                  </td>
                  <td className={`sales-report__matrix-computed sales-report__compare-num${countTone}`}>
                    {Math.round(Number(row.count_progress_pct) || 0)}%
                  </td>
                  <td className="sales-report__matrix-computed sales-report__compare-money">{formatRub(row.plan.avg_check)}</td>
                  <td className="sales-report__matrix-computed sales-report__compare-money">
                    {row.fact.avg_check != null ? formatRub(row.fact.avg_check) : '—'}
                  </td>
                  <td className={`sales-report__matrix-computed sales-report__compare-money${avgTone}`}>
                    {row.avg_gap_rub != null
                      ? `${row.avg_gap_rub > 0 ? '+' : ''}${formatRub(row.avg_gap_rub)}`
                      : '—'}
                  </td>
                  <td className="sales-report__matrix-computed sales-report__compare-money">{formatRub(row.plan.amount)}</td>
                  <td className={`sales-report__matrix-computed sales-report__compare-money${amountTone}`}>
                    {formatRub(row.fact.amount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
