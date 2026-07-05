import { useEffect, useMemo, useState } from 'react'
import { buildPlanMilestoneVisual } from '../lib/admin/salesPlanProgress.js'
import { formatRub } from '../lib/admin/salesReportCore.js'

function formatRubAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

function formatRubCompact(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return formatRubAmount(n)
}

/**
 * @param {{
 *   fact: number,
 *   planLevels?: { level1?: number, level2?: number, level3?: number },
 *   pulseKey?: number,
 * }} props
 */
export function SalesPlanVessel({ fact, planLevels, pulseKey = 0 }) {
  const milestone = useMemo(() => buildPlanMilestoneVisual(fact, planLevels ?? {}), [fact, planLevels])
  const [mounted, setMounted] = useState(false)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    if (!pulseKey) return undefined
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 800)
    return () => clearTimeout(t)
  }, [pulseKey])

  const hasPlan = milestone.finalTarget > 0
  const achievedLabel =
    milestone.achievedLevel > 0 ? `Достигнут уровень ${milestone.achievedLevel}` : 'Уровень не достигнут'

  const ariaLabel = hasPlan
    ? `Факт ${formatRub(fact)}, финал ${formatRub(milestone.finalTarget)}, ${achievedLabel}`
    : `Факт продаж за месяц: ${formatRub(fact)}`

  return (
    <div className="sales-report__plan-chart" aria-label={ariaLabel}>
      <div className="sales-report__plan-track sales-report__plan-track--milestones" aria-hidden>
        {milestone.milestones.map((m) => (
          <span
            key={m.key}
            className={`sales-report__plan-milestone${m.reached ? ' sales-report__plan-milestone--reached' : ''}${m.isFinal ? ' sales-report__plan-milestone--final' : ''}`}
            style={{ left: `${m.leftPercent}%` }}
            title={`${m.label}: ${formatRub(m.amount)}`}
          />
        ))}
        <div
          className={`sales-report__plan-fill${milestone.overflow ? ' sales-report__plan-fill--overflow' : ''}${pulse ? ' sales-report__plan-fill--pulse' : ''}${mounted ? ' sales-report__plan-fill--ready' : ''}${milestone.fillPercent > 0 ? ' sales-report__plan-fill--active' : ''}`}
          style={{ width: mounted ? `${milestone.fillPercent}%` : '0%' }}
        >
          <span className="sales-report__plan-shimmer" />
          <span className="sales-report__plan-edge" />
        </div>
      </div>

      {milestone.milestones.length ? (
        <div className="sales-report__plan-milestone-labels" aria-hidden>
          {milestone.milestones.map((m) => (
            <span
              key={`${m.key}-label`}
              className={`sales-report__plan-milestone-label${m.reached ? ' is-reached' : ''}`}
              style={{ left: `${m.leftPercent}%` }}
            >
              <span className="sales-report__plan-milestone-name">{m.label}</span>
              <span className="sales-report__plan-milestone-sum">{formatRubCompact(m.amount)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <p className="sales-report__plan-fraction">
        <span className="sales-report__plan-fact">{formatRubAmount(fact)}</span>
        <span className="sales-report__plan-sep">/</span>
        <span className="sales-report__plan-target muted">
          {hasPlan ? `${formatRubAmount(milestone.finalTarget)} ₽` : '—'}
        </span>
        {hasPlan && milestone.overflow ? (
          <span className="sales-report__plan-badge">+{milestone.overflowPercent}%</span>
        ) : null}
      </p>

      {hasPlan ? (
        <p className="sales-report__plan-status muted" role="status">
          {achievedLabel}
          {milestone.achievedLevel < 3 ? ' · финал — уровень 3' : ' · финал достигнут'}
        </p>
      ) : null}
    </div>
  )
}
